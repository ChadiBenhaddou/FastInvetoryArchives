<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Box */
class BoxResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'status' => $this->status->value,
            'device' => $this->whenLoaded('device', fn () => $this->device?->letter),
            'agent_name' => $this->agent_name,
            'room' => $this->room,
            'shelf' => $this->shelf,
            'row' => $this->row,
            'photo_count' => $this->photo_count,
            'documents_count' => $this->documents_count ?? null,
            'to_review_count' => $this->to_review_count ?? null,
            'import_id' => $this->import_id,
            'created_on_phone_at' => $this->created_on_phone_at?->toIso8601String(),
            'closed_at' => $this->closed_at?->toIso8601String(),
            'images' => $this->whenLoaded('images', fn () => $this->images->map(fn ($img) => [
                'id' => $img->id,
                'sequence' => $img->sequence,
                'type' => $img->type->value,
                'ocr_status' => $img->ocr_status->value,
                'width' => $img->width,
                'height' => $img->height,
                'url' => "/api/images/{$img->id}",
                'thumb_url' => "/api/images/{$img->id}/thumb",
                'document' => $img->relationLoaded('document') && $img->document
                    ? (new DocumentResource($img->document))->toArray($request) : null,
            ])),
            'pending_conflicts' => $this->pending_conflicts ?? null,
        ];
    }
}
