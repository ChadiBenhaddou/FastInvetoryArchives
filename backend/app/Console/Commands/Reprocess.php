<?php

namespace App\Console\Commands;

use App\Enums\BoxStatus;
use App\Enums\ImageType;
use App\Enums\OcrStatus;
use App\Jobs\ExtractMetadataJob;
use App\Jobs\RunOcrJob;
use App\Models\Box;
use App\Models\Document;
use App\Models\Image;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('archive:reprocess {codes?* : Box codes} {--failed : Only what failed} {--all : Every box} {--extraction : Re-run only the LLM extraction (e.g. after changing LLM_MODEL)}')]
#[Description('Queue photos again for OCR (then extraction and indexing), or only the extraction')]
class Reprocess extends Command
{
    public function handle(): int
    {
        $codes = $this->argument('codes');
        if (! $codes && ! $this->option('all') && ! $this->option('failed')) {
            $this->error('Préciser des codes de boîtes, --failed ou --all.');

            return self::FAILURE;
        }
        $boxIds = $codes ? Box::whereIn('code', $codes)->pluck('id') : null;

        $count = $this->option('extraction') ? $this->extractions($boxIds) : $this->ocr($boxIds);
        Box::whereIn('id', $this->touchedBoxes)->update(['status' => BoxStatus::Processing]);
        $this->info("{$count} photo(s) remise(s) dans la file de traitement.");

        return self::SUCCESS;
    }

    private array $touchedBoxes = [];

    private function ocr($boxIds): int
    {
        $query = Image::where('type', ImageType::Document);
        if ($boxIds) {
            $query->whereIn('box_id', $boxIds);
        }
        if ($this->option('failed')) {
            $query->where('ocr_status', OcrStatus::Failed);
        }

        $count = 0;
        $query->select(['id', 'box_id'])->chunkById(500, function ($images) use (&$count) {
            Image::whereIn('id', $images->pluck('id'))->update(['ocr_status' => OcrStatus::Pending]);
            array_push($this->touchedBoxes, ...$images->pluck('box_id')->unique());
            foreach ($images as $image) {
                RunOcrJob::dispatch($image->id, force: true);
                $count++;
            }
        });

        return $count;
    }

    private function extractions($boxIds): int
    {
        $query = Document::whereNotNull('ocr_text')->where('ocr_text', '!=', '');
        if ($boxIds) {
            $query->whereIn('box_id', $boxIds);
        }
        if ($this->option('failed')) {
            $query->where('extraction_status', 'failed');
        }

        $count = 0;
        $query->select(['id', 'box_id'])->chunkById(500, function ($docs) use (&$count) {
            Document::whereIn('id', $docs->pluck('id'))->update(['extraction_status' => 'pending']);
            array_push($this->touchedBoxes, ...$docs->pluck('box_id')->unique());
            foreach ($docs as $doc) {
                ExtractMetadataJob::dispatch($doc->id, force: true);
                $count++;
            }
        });

        return $count;
    }
}
