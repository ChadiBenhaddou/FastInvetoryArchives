<?php

namespace App\Console\Commands;

use App\Models\Document;
use App\Services\Search\SearchIndex;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Throwable;

#[Signature('archive:search-setup {--reindex : Send every document to the search engine again}')]
#[Description('Create/configure the search index (run at every start); --reindex rebuilds it from the database')]
class SearchSetup extends Command
{
    public function handle(SearchIndex $index): int
    {
        try {
            $index->setup();
        } catch (Throwable $e) {
            $this->warn('Moteur de recherche indisponible : '.$e->getMessage());

            return self::FAILURE;
        }
        $this->info('Index de recherche configuré.');

        if ($this->option('reindex')) {
            $count = 0;
            Document::with(['box.device', 'image'])->chunkById(200, function ($docs) use ($index, &$count) {
                $index->upsert(...$docs->all());
                Document::whereIn('id', $docs->pluck('id'))->update(['index_status' => 'done', 'indexed_at' => now()]);
                $count += $docs->count();
            });
            $this->info("{$count} document(s) réindexé(s).");
        }

        return self::SUCCESS;
    }
}
