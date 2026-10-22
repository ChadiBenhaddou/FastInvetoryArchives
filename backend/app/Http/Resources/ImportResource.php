<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Import */
class ImportResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'export_id' => $this->export_id,
            'file_name' => $this->file_name,
            'file_size' => $this->file_size,
            'source' => $this->source,
            'status' => $this->status->value,
            'device' => $this->whenLoaded('device', fn () => $this->device?->letter),
            'agent_name' => $this->agent_name,
            'app_version' => $this->app_version,
            'exported_at' => $this->exported_at?->toIso8601String(),
            'sequence_from' => $this->sequence_from,
            'sequence_to' => $this->sequence_to,
            'box_count' => $this->box_count,
            'photo_count' => $this->photo_count,
            'imported_by' => $this->whenLoaded('importer', fn () => $this->importer?->name),
            // Shown as the user sees it on the PC, not the container path.
            'archived_path' => $this->archived_path
                ? str_replace(rtrim(config('archive.root'), '/'), rtrim(config('archive.host_root'), '/\\'), $this->archived_path)
                : null,
            'report' => $this->when($request->routeIs('imports.show') || $request->routeIs('uploads.complete'), $this->report),
            'summary' => $this->report['summary'] ?? null,
            'fatal' => $this->report['fatal'] ?? null,
            'created_at' => $this->created_at?->toIso8601String(),
            'imported_at' => $this->imported_at?->toIso8601String(),
        ];
    }
}
