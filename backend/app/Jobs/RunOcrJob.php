<?php

namespace App\Jobs;

use App\Enums\ImageType;
use App\Enums\OcrStatus;
use App\Models\Document;
use App\Models\Image;
use App\Models\ProcessingLog;
use App\Services\Ocr\OcrClient;
use App\Services\Pipeline;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * OCR of one document photo by the local OCR worker. Safe to re-run: the document row
 * is updated in place, and an image already done is skipped unless $force.
 */
class RunOcrJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 330;

    public function __construct(public int $imageId, public bool $force = false)
    {
        $this->onQueue('ocr');
    }

    /** Waits before retrying: the OCR worker may be restarting or overloaded. */
    public function backoff(): array
    {
        return [30, 120];
    }

    public function handle(OcrClient $ocr, Pipeline $pipeline): void
    {
        $image = Image::find($this->imageId);
        if (! $image || $image->type === ImageType::CodePhoto) {
            return;
        }
        if ($image->ocr_status === OcrStatus::Done && ! $this->force) {
            $pipeline->afterOcr($image);

            return;
        }

        $image->update(['ocr_status' => OcrStatus::Processing]);
        ProcessingLog::record($image->id, 'ocr', 'started', "attempt {$this->attempts()}");
        $started = hrtime(true);

        try {
            $result = $ocr->recognize(Storage::disk('archive')->path($image->path));
        } catch (Throwable $e) {
            ProcessingLog::record($image->id, 'ocr', 'error', $e->getMessage(), $this->elapsed($started));
            throw $e; // retried by the queue, then failed() below
        }

        $doc = Document::firstOrNew(['image_id' => $image->id]);
        $doc->fill([
            'box_id' => $image->box_id,
            'ocr_text' => $result['text'],
            'ocr_blocks' => [
                // Bounding boxes refer to the page after this rotation/deskew (for highlighting).
                'rotation' => $result['rotation'] ?? 0,
                'skew' => $result['skew'] ?? 0,
                'width' => $result['width'] ?? null,
                'height' => $result['height'] ?? null,
                'blocks' => $result['blocks'],
            ],
            'language' => $result['language'],
            'ocr_confidence' => $result['confidence'],
            'is_handwritten' => $result['is_handwritten'],
            'ocr_engine' => $result['engine'] ?? null,
        ]);
        $doc->review_reasons = $pipeline->reviewReasons($doc);
        $doc->needs_review = $doc->review_reasons !== [];
        $doc->save();

        $image->update(['ocr_status' => OcrStatus::Done]);
        ProcessingLog::record($image->id, 'ocr', 'success', sprintf(
            '%s, %s, confiance %.2f, %d ligne(s)%s',
            $result['engine'] ?? '?', $result['language'] ?? 'aucun texte', $result['confidence'],
            count($result['blocks']), $result['is_handwritten'] ? ', manuscrit probable' : '',
        ), $this->elapsed($started));

        $pipeline->afterOcr($image);
    }

    /** All retries used up: the photo is flagged for review instead of blocking its box. */
    public function failed(Throwable $e): void
    {
        $image = Image::find($this->imageId);
        if (! $image) {
            return;
        }
        $image->update(['ocr_status' => OcrStatus::Failed]);

        $pipeline = app(Pipeline::class);
        $doc = Document::firstOrNew(['image_id' => $image->id]);
        $doc->box_id = $image->box_id;
        $doc->review_reasons = $pipeline->reviewReasons($doc, ocrFailed: true);
        $doc->needs_review = true;
        $doc->save();

        ProcessingLog::record($image->id, 'ocr', 'failed', $e->getMessage());
        $pipeline->afterOcr($image);
    }

    private function elapsed(int $started): int
    {
        return (int) ((hrtime(true) - $started) / 1_000_000);
    }
}
