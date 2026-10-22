<?php

namespace App\Services;

use App\Enums\BoxStatus;
use App\Enums\ImageType;
use App\Enums\OcrStatus;
use App\Jobs\RunOcrJob;
use App\Models\Box;
use App\Models\Document;
use App\Models\Image;
use App\Models\ProcessingLog;

/**
 * Processing of imported photos, all local, one queued job per step and image:
 *   RunOcrJob (OCR worker) → [deliverable 5: ExtractMetadataJob (Ollama) → IndexDocumentJob (Meilisearch)]
 * A box moves from "processing" to "review" when every document photo went through
 * every step (successfully or not: failures are flagged for review, never lost).
 */
class Pipeline
{
    /** Queues the processing of every document photo of a freshly imported box. */
    public function startBox(Box $box): int
    {
        $images = $box->images()
            ->where('type', ImageType::Document)
            ->whereIn('ocr_status', [OcrStatus::Pending, OcrStatus::Failed])
            ->get();

        $box->update(['status' => BoxStatus::Processing]);
        foreach ($images as $image) {
            RunOcrJob::dispatch($image->id);
        }
        $this->checkBox($box->id); // a box with only its code photo is done at once

        return $images->count();
    }

    /** Called when the OCR of an image ended (success or final failure). */
    public function afterOcr(Image $image): void
    {
        // Deliverable 5 chains ExtractMetadataJob here.
        $this->checkBox($image->box_id);
    }

    public function checkBox(int $boxId): void
    {
        $remaining = Image::where('box_id', $boxId)
            ->where('type', ImageType::Document)
            ->whereIn('ocr_status', [OcrStatus::Pending, OcrStatus::Processing])
            ->exists();

        if (! $remaining) {
            // Conditional update: safe when several workers finish images of the same box at once.
            Box::whereKey($boxId)->where('status', BoxStatus::Processing)->update(['status' => BoxStatus::Review]);
        }
    }

    /**
     * Why a document needs a human look (empty = no review needed).
     *
     * @return string[]
     */
    public function reviewReasons(Document $doc, bool $ocrFailed = false): array
    {
        $min = config('archive.review');
        $reasons = [];
        if ($ocrFailed) {
            $reasons[] = 'ocr_failed';
        } elseif (trim((string) $doc->ocr_text) === '') {
            $reasons[] = 'no_text';
        } elseif ($doc->ocr_confidence !== null && $doc->ocr_confidence < $min['min_ocr_confidence']) {
            $reasons[] = 'low_ocr_confidence';
        }
        if ($doc->is_handwritten) {
            $reasons[] = 'handwritten';
        }
        if ($doc->extraction_confidence !== null && $doc->extraction_confidence < $min['min_extraction_confidence']) {
            $reasons[] = 'low_extraction_confidence';
        }
        if ($doc->extraction_status === 'failed') {
            $reasons[] = 'extraction_failed';
        }

        return $reasons;
    }

    /** Queue progress for the dashboard, with an estimated time remaining. */
    public function status(): array
    {
        $images = Image::where('type', ImageType::Document)
            ->selectRaw('ocr_status, count(*) as n')->groupBy('ocr_status')->pluck('n', 'ocr_status');
        $boxes = Box::selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');

        $recent = ProcessingLog::where('step', 'ocr')->where('status', 'success')
            ->latest('id')->limit(200)->pluck('duration_ms');
        $avgMs = $recent->isEmpty() ? null : (int) $recent->avg();

        $waiting = (int) ($images['pending'] ?? 0) + (int) ($images['processing'] ?? 0);
        $workers = max(1, config('archive.pipeline.workers'));

        return [
            'images' => [
                'pending' => (int) ($images['pending'] ?? 0),
                'processing' => (int) ($images['processing'] ?? 0),
                'done' => (int) ($images['done'] ?? 0),
                'failed' => (int) ($images['failed'] ?? 0),
            ],
            'boxes' => collect(BoxStatus::cases())->mapWithKeys(fn ($s) => [$s->value => (int) ($boxes[$s->value] ?? 0)]),
            'avg_ocr_ms' => $avgMs,
            'workers' => $workers,
            'eta_seconds' => $avgMs && $waiting ? (int) ceil($waiting / $workers * $avgMs / 1000) : ($waiting ? null : 0),
            'needs_review' => Document::where('needs_review', true)->whereNull('reviewed_at')->count(),
        ];
    }
}
