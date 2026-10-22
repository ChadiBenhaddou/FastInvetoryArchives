<?php

namespace App\Console\Commands;

use App\Enums\BoxStatus;
use App\Enums\ImageType;
use App\Enums\OcrStatus;
use App\Jobs\RunOcrJob;
use App\Models\Box;
use App\Models\Image;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('archive:reprocess {codes?* : Box codes (all boxes if omitted with --all)} {--failed : Only photos whose OCR failed} {--all : Every document photo}')]
#[Description('Queue the OCR of photos again (after an OCR worker problem or a model update)')]
class Reprocess extends Command
{
    public function handle(): int
    {
        $query = Image::where('type', ImageType::Document);
        if ($codes = $this->argument('codes')) {
            $query->whereIn('box_id', Box::whereIn('code', $codes)->pluck('id'));
        } elseif (! $this->option('all') && ! $this->option('failed')) {
            $this->error('Préciser des codes de boîtes, --failed ou --all.');

            return self::FAILURE;
        }
        if ($this->option('failed')) {
            $query->where('ocr_status', OcrStatus::Failed);
        }

        $count = 0;
        $query->select(['id', 'box_id'])->chunkById(500, function ($images) use (&$count) {
            Image::whereIn('id', $images->pluck('id'))->update(['ocr_status' => OcrStatus::Pending]);
            Box::whereIn('id', $images->pluck('box_id')->unique())->update(['status' => BoxStatus::Processing]);
            foreach ($images as $image) {
                RunOcrJob::dispatch($image->id, force: true);
                $count++;
            }
        });

        $this->info("{$count} photo(s) remise(s) dans la file d'OCR.");

        return self::SUCCESS;
    }
}
