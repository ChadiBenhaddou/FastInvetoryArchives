<?php

namespace App\Http\Resources;

use App\Services\SequenceGaps;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Device */
class DeviceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'letter' => $this->letter,
            'label' => $this->label,
            'is_active' => $this->is_active,
            'notes' => $this->notes,
            'has_pin' => (bool) $this->admin_pin,
            'box_count' => $this->boxes_count ?? null,
            'last_sequence_seen' => $this->last_sequence_seen,
            'last_sequence_issued' => $this->last_sequence_issued,
            'open_sequences' => $this->open_sequences ?? [],
            'gaps' => app(SequenceGaps::class)->forDevice($this->resource),
        ];
    }
}
