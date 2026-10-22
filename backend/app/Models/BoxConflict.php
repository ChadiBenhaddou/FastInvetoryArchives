<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'import_id', 'device_id', 'code', 'existing_box_id', 'incoming', 'incoming_path',
    'status', 'resolution', 'resolved_by', 'resolved_at',
])]
class BoxConflict extends Model
{
    use Auditable;

    protected function casts(): array
    {
        return [
            'incoming' => 'array',
            'resolved_at' => 'datetime',
        ];
    }

    public function import(): BelongsTo
    {
        return $this->belongsTo(Import::class);
    }

    public function existingBox(): BelongsTo
    {
        return $this->belongsTo(Box::class, 'existing_box_id');
    }
}
