<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Document */
class DocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'image_id' => $this->image_id,
            'ocr_text' => $this->ocr_text,
            'ocr_blocks' => $this->ocr_blocks,
            'language' => $this->language,
            'ocr_confidence' => $this->ocr_confidence,
            'ocr_engine' => $this->ocr_engine,
            'is_handwritten' => $this->is_handwritten,
            'extraction_status' => $this->extraction_status,
            'extraction_model' => $this->extraction_model,
            'extraction_confidence' => $this->extraction_confidence,
            'doc_type' => $this->doc_type,
            'title' => $this->title,
            'doc_date' => $this->doc_date?->format('Y-m-d'),
            'reference_number' => $this->reference_number,
            'persons' => $this->persons ?? [],
            'organizations' => $this->organizations ?? [],
            'keywords' => $this->keywords ?? [],
            'summary' => $this->summary,
            'needs_review' => $this->needs_review,
            'review_reasons' => $this->review_reasons ?? [],
            'reviewed_by' => $this->whenLoaded('reviewer', fn () => $this->reviewer?->name),
            'reviewed_at' => $this->reviewed_at?->toIso8601String(),
            'index_status' => $this->index_status,
        ];
    }
}
