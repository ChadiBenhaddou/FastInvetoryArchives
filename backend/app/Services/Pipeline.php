<?php

namespace App\Services;

use App\Enums\BoxStatus;
use App\Enums\ImageType;
use App\Enums\OcrStatus;
use App\Jobs\ExtractMetadataJob;
use App\Jobs\IndexDocumentJob;
use App\Jobs\RunOcrJob;
use App\Models\Box;
use App\Models\Document;
use App\Models\Image;
use App\Models\ProcessingLog;

/**
 * Processing of imported photos, all local, one queued job per step and photo:
 *   RunOcrJob (OCR worker) → ExtractMetadataJob (Ollama) → IndexDocumentJob (Meilisearch)
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

    /**
     * OCR ended (success or final failure). The document is indexed right away, so its
     * text is searchable within seconds; the LLM extraction (much slower on CPU) follows
     * and re-indexes it with the extracted fields.
     */
    public function afterOcr(Image $image): void
    {
        $doc = Document::where('image_id', $image->id)->first();
        if (! $doc) {
            $this->checkBox($image->box_id);

            return;
        }
        $doc->index_status = 'pending';
        $hasText = $image->ocr_status === OcrStatus::Done && trim((string) $doc->ocr_text) !== '';
        // Nothing to read: no extraction, but still indexed so the photo is found by box / place.
        $doc->extraction_status = $hasText ? 'pending' : 'skipped';
        $doc->save();

        IndexDocumentJob::dispatch($doc->id);
        if ($hasText) {
            ExtractMetadataJob::dispatch($doc->id);
        }
    }

    public function afterExtraction(Document $doc): void
    {
        $doc->forceFill(['index_status' => 'pending'])->saveQuietly();
        IndexDocumentJob::dispatch($doc->id);
    }

    public function afterIndex(Document $doc): void
    {
        $this->checkBox($doc->box_id);
    }

    /** "review" once no document photo of the box has a step still waiting or running. */
    public function checkBox(int $boxId): void
    {
        $unfinished = Image::where('images.box_id', $boxId)
            ->where('images.type', ImageType::Document)
            ->leftJoin('documents', 'documents.image_id', '=', 'images.id')
            ->where(function ($q) {
                $q->whereIn('images.ocr_status', [OcrStatus::Pending, OcrStatus::Processing])
                    ->orWhereNull('documents.id')
                    ->orWhereIn('documents.extraction_status', ['pending', 'processing'])
                    ->orWhere('documents.index_status', 'pending');
            })
            ->exists();

        if (! $unfinished) {
            // Conditional update: safe when several workers finish photos of the same box at once.
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
        if ($doc->extraction_status === 'failed') {
            $reasons[] = 'extraction_failed';
        } elseif ($doc->extraction_status === 'done' && $doc->extraction_confidence !== null
            && $doc->extraction_confidence < $min['min_extraction_confidence']) {
            $reasons[] = 'low_extraction_confidence';
        }

        return $reasons;
    }

    /** Queue progress for the dashboard, with an estimated time remaining. */
    public function status(): array
    {
        $images = Image::where('type', ImageType::Document)
            ->selectRaw('ocr_status, count(*) as n')->groupBy('ocr_status')->pluck('n', 'ocr_status');
        $boxes = Box::selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');
        $extraction = Document::selectRaw('extraction_status, count(*) as n')->groupBy('extraction_status')->pluck('n', 'extraction_status');

        $avg = fn (string $step) => ($d = ProcessingLog::where('step', $step)->where('status', 'success')
            ->latest('id')->limit(200)->pluck('duration_ms'))->isEmpty() ? null : (int) $d->avg();
        $ocrMs = $avg('ocr');
        $extractMs = $avg('extract');

        $ocrWaiting = (int) ($images['pending'] ?? 0) + (int) ($images['processing'] ?? 0);
        // Photos still waiting for OCR will (nearly all) need an extraction too.
        $extractWaiting = (int) ($extraction['pending'] ?? 0) + (int) ($extraction['processing'] ?? 0) + $ocrWaiting;
        $ocrWorkers = max(1, config('archive.pipeline.workers'));
        $extractWorkers = max(1, config('archive.pipeline.extract_workers'));

        $eta = function (int $waiting, ?int $ms, int $workers) {
            if ($waiting === 0) {
                return 0;
            }

            return $ms ? (int) ceil($waiting / $workers * $ms / 1000) : null;
        };
        $ocrEta = $eta($ocrWaiting, $ocrMs, $ocrWorkers);
        $extractEta = $eta($extractWaiting, $extractMs, $extractWorkers);

        return [
            'images' => [
                'pending' => (int) ($images['pending'] ?? 0),
                'processing' => (int) ($images['processing'] ?? 0),
                'done' => (int) ($images['done'] ?? 0),
                'failed' => (int) ($images['failed'] ?? 0),
            ],
            'extraction' => [
                'pending' => (int) ($extraction['pending'] ?? 0) + (int) ($extraction['processing'] ?? 0),
                'done' => (int) ($extraction['done'] ?? 0),
                'failed' => (int) ($extraction['failed'] ?? 0),
            ],
            'not_indexed' => Document::whereIn('index_status', ['pending', 'failed'])->count(),
            'boxes' => collect(BoxStatus::cases())->mapWithKeys(fn ($s) => [$s->value => (int) ($boxes[$s->value] ?? 0)]),
            'avg_ocr_ms' => $ocrMs,
            'avg_extract_ms' => $extractMs,
            'workers' => $ocrWorkers,
            'extract_workers' => $extractWorkers,
            // Steps run in parallel: the slowest one sets the pace.
            'eta_seconds' => $ocrEta === null || $extractEta === null ? null : max($ocrEta, $extractEta),
            'needs_review' => Document::where('needs_review', true)->whereNull('reviewed_at')->count(),
        ];
    }
}
