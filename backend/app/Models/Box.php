<?php

namespace App\Models;

use App\Enums\BoxStatus;
use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'code', 'device_id', 'sequence', 'import_id', 'agent_name', 'room', 'shelf', 'row',
    'status', 'photo_count', 'created_on_phone_at', 'closed_at',
])]
class Box extends Model
{
    use Auditable;

    protected function casts(): array
    {
        return [
            'status' => BoxStatus::class,
            'sequence' => 'integer',
            'photo_count' => 'integer',
            'created_on_phone_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    public function import(): BelongsTo
    {
        return $this->belongsTo(Import::class);
    }

    public function images(): HasMany
    {
        return $this->hasMany(Image::class)->orderBy('sequence');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }
}
