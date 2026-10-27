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
use App\Services\Extraction\RuleExtractor;

/**
 * Processing of imported photos, all local, one queued job per step and photo:
 *   RunOcrJob (OCR + fields by rules) → IndexDocumentJob (Meilisearch)
 *   with LLM_ENABLED: RunOcrJob → ExtractMetadataJob (Ollama) → IndexDocumentJob
 * A box moves from "processing" to "review" when every document photo went through
 * every step (successfully or not: failures are flagged for review, never lost).
 */
class Pipeline
{
    public function __construct(private RuleExtractor $rules) {}

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
     * OCR ended (success or final failure). By default the fields are extracted here by rules
     * (milliseconds) and the document is indexed once, complete: a box is ready for review
     * seconds after its photos are read. With LLM_ENABLED the document is indexed right away
     * (searchable within seconds) and the LLM extraction (minutes on CPU) re-indexes it later.
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
        $llm = config('archive.llm.enabled');
        if ($hasText && ! $llm) {
            $this->applyRules($doc);
        } else {
            // Nothing to read: no extraction, but still indexed so the photo is found by box / place.
            $doc->extraction_status = $hasText ? 'pending' : 'skipped';
        }
        $doc->save();

        IndexDocumentJob::dispatch($doc->id);
        if ($hasText && $llm) {
            ExtractMetadataJob::dispatch($doc->id);
        }
    }

    /** Fields by RuleExtractor (not saved here). Also used to re-run the extraction with the LLM off. */
    public function applyRules(Document $doc): void
    {
        $result = $this->rules->extract((string) $doc->ocr_text);
        $doc->fill($result['fields'] + ['extraction_status' => 'done', 'extraction_model' => RuleExtractor::NAME]);
        $doc->review_reasons = $this->reviewReasons($doc);
        $doc->needs_review = $doc->review_reasons !== [];
        ProcessingLog::record($doc->image_id, 'extract', 'success',
            'règles : '.($result['found'] ? implode(', ', $result['found']) : 'rien trouvé'), $result['duration_ms']);
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

    /**
     * "done" once no document photo of the box has a step still waiting or running. No human
     * validation step: documents with a problem stay flagged (needs_review) for information, and
     * can be corrected from the box page at any time.
     */
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
            Box::whereKey($boxId)->where('status', BoxStatus::Processing)->update(['status' => BoxStatus::Done]);
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
        // Without the LLM the fields are extracted inside the OCR job: nothing else to wait for.
        $extractEta = config('archive.llm.enabled') ? $eta($extractWaiting, $extractMs, $extractWorkers) : 0;

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
