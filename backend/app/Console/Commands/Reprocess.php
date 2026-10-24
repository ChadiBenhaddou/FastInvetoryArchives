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
use App\Services\Ocr\PaddleOcrEngine;
use App\Services\Ocr\WindowsOneOcrEngine;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('archive:reprocess {codes?* : Box codes} {--failed : Only what failed} {--all : Every box} {--extraction : Re-run only the LLM extraction (e.g. after changing LLM_MODEL)} {--upgrade : Only photos not read yet by the configured OCR engine (e.g. after installing the Windows OCR)} {--wait : Show the progress until the OCR (or the extraction) is done}')]
#[Description('Queue photos again for OCR (then extraction and indexing), or only the extraction')]
class Reprocess extends Command
{
    public function handle(): int
    {
        $codes = $this->argument('codes');
        if (! $codes && ! $this->option('all') && ! $this->option('failed') && ! $this->option('upgrade')) {
            $this->error('Préciser des codes de boîtes, --failed, --upgrade ou --all.');

            return self::FAILURE;
        }
        $boxIds = $codes ? Box::whereIn('code', $codes)->pluck('id') : null;

        $count = $this->option('extraction') ? $this->extractions($boxIds) : $this->ocr($boxIds);
        $this->info("{$count} photo(s) remise(s) dans la file de traitement.");

        if ($this->option('wait') && $count > 0) {
            $this->waitForQueue();
        }

        return self::SUCCESS;
    }

    /**
     * Before the jobs are queued, never after: a job can finish within a second (the box would
     * then be marked "processing" again and stay so, with nothing left to move it to review).
     */
    private function markProcessing($boxIds): void
    {
        Box::whereIn('id', $boxIds->unique())->update(['status' => BoxStatus::Processing]);
    }

    /** @var int[] */
    private array $queued = [];

    /** Progress bar over the queued photos (or documents, with --extraction). */
    private function waitForQueue(): void
    {
        $extraction = (bool) $this->option('extraction');
        $bar = $this->output->createProgressBar(count($this->queued));
        $bar->setFormat($extraction ? ' extraction IA %current%/%max% [%bar%] %elapsed%' : ' OCR %current%/%max% [%bar%] %elapsed%');
        $bar->start();
        do {
            sleep(3);
            $done = $extraction
                ? Document::whereIn('id', $this->queued)->whereNotIn('extraction_status', ['pending', 'processing'])->count()
                : Image::whereIn('id', $this->queued)->whereNotIn('ocr_status', [OcrStatus::Pending, OcrStatus::Processing])->count();
            $bar->setProgress($done);
        } while ($done < count($this->queued));
        $bar->finish();
        $this->newLine();

        $failed = $extraction
            ? Document::whereIn('id', $this->queued)->where('extraction_status', 'failed')->count()
            : Image::whereIn('id', $this->queued)->where('ocr_status', OcrStatus::Failed)->count();
        $this->line($failed ? "<comment>{$failed} en échec (relancer avec --failed).</comment>" : 'Terminé.');
        if (! $extraction) {
            $this->line('L\'extraction par l\'IA et l\'indexation continuent en arrière-plan (Tableau de bord).');
        }
    }

    private function ocr($boxIds): int
    {
        $query = Image::where('type', ImageType::Document);
        if ($boxIds) {
            $query->whereIn('box_id', $boxIds);
        }
        if ($this->option('failed')) {
            $query->where('ocr_status', OcrStatus::Failed);
        }
        if ($this->option('upgrade')) {
            // Already read by the preferred engine: skipped.
            $engine = config('archive.ocr.engine') === 'windows' ? WindowsOneOcrEngine::NAME : PaddleOcrEngine::NAME;
            $query->whereNotIn('id', Document::where('ocr_engine', $engine)->select('image_id'));
        }

        $count = 0;
        $query->select(['id', 'box_id'])->chunkById(500, function ($images) use (&$count) {
            Image::whereIn('id', $images->pluck('id'))->update(['ocr_status' => OcrStatus::Pending]);
            $this->markProcessing($images->pluck('box_id'));
            array_push($this->queued, ...$images->pluck('id'));
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
            $this->markProcessing($docs->pluck('box_id'));
            array_push($this->queued, ...$docs->pluck('id'));
            foreach ($docs as $doc) {
                ExtractMetadataJob::dispatch($doc->id, force: true);
                $count++;
            }
        });

        return $count;
    }
}
