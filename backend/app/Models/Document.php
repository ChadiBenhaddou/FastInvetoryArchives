<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'box_id', 'image_id', 'ocr_text', 'ocr_blocks', 'language', 'ocr_confidence', 'is_handwritten', 'ocr_engine',
    'extraction_status', 'extraction_model', 'doc_type', 'doc_date', 'reference_number', 'title', 'persons',
    'organizations', 'keywords', 'summary', 'extraction_confidence', 'needs_review', 'review_reasons',
    'reviewed_by', 'reviewed_at', 'indexed_at', 'index_status',
])]
class Document extends Model
{
    use Auditable;

    protected function casts(): array
    {
        return [
            'ocr_blocks' => 'array',
            'ocr_confidence' => 'float',
            'is_handwritten' => 'boolean',
            'doc_date' => 'date:Y-m-d',
            'persons' => 'array',
            'organizations' => 'array',
            'keywords' => 'array',
            'extraction_confidence' => 'float',
            'needs_review' => 'boolean',
            'review_reasons' => 'array',
            'reviewed_at' => 'datetime',
            'indexed_at' => 'datetime',
        ];
    }

    public function box(): BelongsTo
    {
        return $this->belongsTo(Box::class);
    }

    public function image(): BelongsTo
    {
        return $this->belongsTo(Image::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
