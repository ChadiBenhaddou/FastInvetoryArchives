<?php

namespace App\Http\Controllers;

use App\Models\BoxConflict;
use App\Services\ConflictResolver;
use App\Services\Thumbnails;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** Admin review of box codes received twice with different photos. */
class ConflictController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $status = $request->query('status', 'pending');

        return response()->json(['data' => BoxConflict::with(['existingBox', 'import'])
            ->where('status', $status)->latest('id')->limit(200)->get()
            ->map(fn (BoxConflict $c) => $this->summary($c))]);
    }

    public function show(BoxConflict $conflict): JsonResponse
    {
        $conflict->load(['existingBox.images', 'import']);
        $existing = $conflict->existingBox;

        return response()->json(['data' => [
            ...$this->summary($conflict),
            'existing' => $existing ? [
                'id' => $existing->id,
                'code' => $existing->code,
                'location' => array_filter([$existing->room, $existing->shelf, $existing->row]),
                'agent_name' => $existing->agent_name,
                'created_on_phone_at' => $existing->created_on_phone_at?->toIso8601String(),
                'photos' => $existing->images->map(fn ($img) => [
                    'sequence' => $img->sequence, 'type' => $img->type->value,
                    'url' => "/api/images/{$img->id}", 'thumb_url' => "/api/images/{$img->id}/thumb",
                ]),
            ] : null,
            'incoming' => [
                'location' => array_filter(array_values($conflict->incoming['location'] ?? [])),
                'agent_name' => $conflict->import?->agent_name,
                'created_on_phone_at' => $conflict->incoming['created_at'] ?? null,
                'photos' => collect($conflict->incoming['photos'])->map(fn ($p) => [
                    'sequence' => $p['sequence'], 'type' => $p['type'],
                    'url' => "/api/conflicts/{$conflict->id}/photos/{$p['sequence']}",
                    'thumb_url' => "/api/conflicts/{$conflict->id}/photos/{$p['sequence']}?thumb=1",
                ]),
            ],
        ]]);
    }

    public function photo(Request $request, BoxConflict $conflict, int $sequence, Thumbnails $thumbs): BinaryFileResponse
    {
        $path = Storage::disk('archive')->path(sprintf('%s/%03d.jpg', $conflict->incoming_path, $sequence));
        abort_unless(is_file($path), 404);
        if ($request->boolean('thumb')) {
            $path = $thumbs->for($path, "conflict-{$conflict->id}-{$sequence}");
        }

        return response()->file($path, ['Content-Type' => 'image/jpeg', 'Cache-Control' => 'private, max-age=3600']);
    }

    public function resolve(Request $request, BoxConflict $conflict, ConflictResolver $resolver): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', Rule::in(['keep_existing', 'new_box', 'replace'])],
            'code' => ['required_if:action,new_box', 'nullable', 'string', 'max:20'],
        ]);
        $resolver->resolve($conflict, $data['action'], $request->user(), $data['code'] ?? null);

        return response()->json(['data' => $this->summary($conflict->fresh(['existingBox', 'import']))]);
    }

    private function summary(BoxConflict $c): array
    {
        return [
            'id' => $c->id,
            'code' => $c->code,
            'status' => $c->status,
            'resolution' => $c->resolution,
            'import_id' => $c->import_id,
            'import_file' => $c->import?->file_name,
            'existing_box_id' => $c->existing_box_id,
            'existing_photos' => $c->existingBox?->photo_count,
            'incoming_photos' => count($c->incoming['photos'] ?? []),
            'created_at' => $c->created_at?->toIso8601String(),
            'resolved_at' => $c->resolved_at?->toIso8601String(),
        ];
    }
}
