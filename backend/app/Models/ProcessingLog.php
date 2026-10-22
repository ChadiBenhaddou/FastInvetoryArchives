<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['image_id', 'step', 'status', 'message', 'duration_ms'])]
class ProcessingLog extends Model
{
    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    public static function record(int $imageId, string $step, string $status, ?string $message = null, ?int $durationMs = null): self
    {
        return static::create([
            'image_id' => $imageId,
            'step' => $step,
            'status' => $status,
            'message' => $message === null ? null : mb_substr($message, 0, 2000),
            'duration_ms' => $durationMs,
        ]);
    }

    public function image(): BelongsTo
    {
        return $this->belongsTo(Image::class);
    }
}
