<?php

namespace App\Models;

use App\Enums\ImportStatus;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'export_id', 'device_id', 'agent_name', 'file_name', 'file_size', 'source', 'app_version',
    'exported_at', 'sequence_from', 'sequence_to', 'box_count', 'photo_count', 'status',
    'report', 'imported_by', 'imported_at',
])]
class Import extends Model
{
    protected function casts(): array
    {
        return [
            'status' => ImportStatus::class,
            'report' => 'array',
            'exported_at' => 'datetime',
            'imported_at' => 'datetime',
        ];
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    public function importer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'imported_by');
    }

    public function boxes(): HasMany
    {
        return $this->hasMany(Box::class);
    }
}
