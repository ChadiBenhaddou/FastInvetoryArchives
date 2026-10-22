<?php

namespace App\Models;

use App\Enums\ImageType;
use App\Enums\OcrStatus;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Fillable([
    'box_id', 'sequence', 'type', 'path', 'original_name', 'checksum', 'file_size',
    'width', 'height', 'quality_score', 'ocr_status', 'taken_at',
])]
class Image extends Model
{
    protected function casts(): array
    {
        return [
            'type' => ImageType::class,
            'ocr_status' => OcrStatus::class,
            'sequence' => 'integer',
            'quality_score' => 'float',
            'taken_at' => 'datetime',
        ];
    }

    public function box(): BelongsTo
    {
        return $this->belongsTo(Box::class);
    }

    public function document(): HasOne
    {
        return $this->hasOne(Document::class);
    }

    public function processingLogs(): HasMany
    {
        return $this->hasMany(ProcessingLog::class);
    }
}
