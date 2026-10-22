<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['letter', 'label', 'last_sequence_seen', 'last_sequence_issued', 'open_sequences', 'admin_pin', 'is_active', 'notes'])]
#[Hidden(['admin_pin'])]
class Device extends Model
{
    use Auditable, HasFactory;

    protected function casts(): array
    {
        return [
            'last_sequence_seen' => 'integer',
            'last_sequence_issued' => 'integer',
            'open_sequences' => 'array',
            'admin_pin' => 'encrypted',
            'is_active' => 'boolean',
        ];
    }

    public function boxes(): HasMany
    {
        return $this->hasMany(Box::class);
    }

    public function imports(): HasMany
    {
        return $this->hasMany(Import::class);
    }
}
