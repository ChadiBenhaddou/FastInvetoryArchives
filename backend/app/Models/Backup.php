<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['folder', 'status', 'size_bytes', 'summary', 'error', 'created_by', 'finished_at'])]
class Backup extends Model
{
    protected function casts(): array
    {
        return ['summary' => 'array', 'finished_at' => 'datetime', 'size_bytes' => 'integer'];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public static function lastSuccessful(): ?self
    {
        return static::where('status', 'done')->latest('finished_at')->first();
    }
}
