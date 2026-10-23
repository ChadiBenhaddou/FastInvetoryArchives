<?php

namespace App\Jobs;

use App\Models\Document;
use App\Models\ProcessingLog;
use App\Services\Pipeline;
use App\Services\Search\SearchIndex;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/** Sends one document to the local search engine. Idempotent (upsert by id). */
class IndexDocumentJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;
    public int $timeout = 60;

    public function __construct(public int $documentId)
    {
        $this->onQueue('index');
    }

    public function backoff(): array
    {
        return [10, 30, 120, 600];
    }

    public function handle(SearchIndex $index, Pipeline $pipeline): void
    {
        $doc = Document::find($this->documentId);
        if (! $doc) {
            return;
        }
        $started = hrtime(true);
        $index->upsert($doc);
        $doc->forceFill(['index_status' => 'done', 'indexed_at' => now()])->saveQuietly();
        ProcessingLog::record($doc->image_id, 'index', 'success', null, (int) ((hrtime(true) - $started) / 1_000_000));

        $pipeline->afterIndex($doc);
    }

    /** The search engine stayed down: the box is not blocked; `archive:search-setup --reindex` catches up. */
    public function failed(Throwable $e): void
    {
        if ($doc = Document::find($this->documentId)) {
            $doc->forceFill(['index_status' => 'failed'])->saveQuietly();
            ProcessingLog::record($doc->image_id, 'index', 'failed', $e->getMessage());
            app(Pipeline::class)->afterIndex($doc);
        }
    }
}
