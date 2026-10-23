<?php

namespace App\Jobs;

use App\Models\Document;
use App\Models\ProcessingLog;
use App\Services\Extraction\ExtractionFailed;
use App\Services\Extraction\LlmExtractor;
use App\Services\Pipeline;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Metadata extraction (type, date, reference, persons...) by the local LLM.
 * Safe to re-run: fields are overwritten. An invalid answer is not retried by the queue
 * (the extractor already retried once): the document simply goes to review.
 */
class ExtractMetadataJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 960;

    public function __construct(public int $documentId, public bool $force = false)
    {
        $this->onQueue('extract');
    }

    public function backoff(): array
    {
        return [60, 300];
    }

    public function handle(LlmExtractor $extractor, Pipeline $pipeline): void
    {
        $doc = Document::with('image')->find($this->documentId);
        if (! $doc) {
            return;
        }
        if ($doc->extraction_status === 'done' && ! $this->force) {
            $pipeline->afterExtraction($doc);

            return;
        }

        $doc->update(['extraction_status' => 'processing']);
        ProcessingLog::record($doc->image_id, 'extract', 'started', "attempt {$this->attempts()}");

        try {
            $result = $extractor->extract((string) $doc->ocr_text);
        } catch (ExtractionFailed $e) {
            $this->markFailed($doc, $pipeline, $e->getMessage());

            return;
        } catch (Throwable $e) {
            ProcessingLog::record($doc->image_id, 'extract', 'error', $e->getMessage());
            throw $e; // Ollama unreachable / timeout: retried by the queue
        }

        $fields = $result['fields'];
        // The OCR worker's language detection is more reliable than the model's guess.
        if ($doc->language) {
            unset($fields['language']);
        }
        $doc->fill($fields + ['extraction_status' => 'done', 'extraction_model' => $result['model']]);
        $doc->review_reasons = $pipeline->reviewReasons($doc);
        $doc->needs_review = $doc->review_reasons !== [];
        $doc->save();

        ProcessingLog::record($doc->image_id, 'extract', 'success', sprintf(
            '%s, %s, confiance %.2f%s%s',
            $result['model'], $fields['doc_type'] ?? 'type inconnu', $fields['extraction_confidence'],
            $result['attempts'] > 1 ? ', 2e essai' : '',
            $result['dropped'] ? ', écarté (absent du texte) : '.implode(', ', $result['dropped']) : '',
        ), $result['duration_ms']);

        $pipeline->afterExtraction($doc);
    }

    public function failed(Throwable $e): void
    {
        if ($doc = Document::find($this->documentId)) {
            $this->markFailed($doc, app(Pipeline::class), $e->getMessage());
        }
    }

    private function markFailed(Document $doc, Pipeline $pipeline, string $message): void
    {
        $doc->extraction_status = 'failed';
        $doc->review_reasons = $pipeline->reviewReasons($doc);
        $doc->needs_review = true;
        $doc->save();
        ProcessingLog::record($doc->image_id, 'extract', 'failed', $message);
        $pipeline->afterExtraction($doc);
    }
}
