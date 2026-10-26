<?php

namespace App\Http\Controllers;

use App\Enums\BoxStatus;
use App\Http\Resources\BoxResource;
use App\Models\Box;
use App\Models\BoxConflict;
use App\Models\Device;
use App\Services\BoxCodeCorrector;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class BoxController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'status' => ['nullable', Rule::enum(BoxStatus::class)],
            'agent' => ['nullable', 'string', 'max:255'],
            'device' => ['nullable', 'string', 'size:1'],
            'room' => ['nullable', 'string', 'max:255'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'code' => ['nullable', 'string', 'max:20'],
            'sort' => ['nullable', Rule::in(['code', '-code', 'created', '-created'])],
        ]);

        $query = Box::with('device')
            ->withCount(['documents', 'documents as to_review_count' => fn (Builder $q) => $q->where('needs_review', true)->whereNull('reviewed_at')])
            ->when($data['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($data['agent'] ?? null, fn ($q, $v) => $q->where('agent_name', $v))
            ->when($data['device'] ?? null, fn ($q, $v) => $q->whereHas('device', fn ($d) => $d->where('letter', $v)))
            ->when($data['room'] ?? null, fn ($q, $v) => $q->where('room', $v))
            ->when($data['from'] ?? null, fn ($q, $v) => $q->where('created_on_phone_at', '>=', $v))
            ->when($data['to'] ?? null, fn ($q, $v) => $q->where('created_on_phone_at', '<', date('Y-m-d', strtotime($v.' +1 day'))))
            ->when($data['code'] ?? null, fn ($q, $v) => $q->where('code', 'like', strtoupper(str_replace(['%', '_'], '', $v)).'%'));

        match ($data['sort'] ?? '-created') {
            'code' => $query->orderBy('code'),
            '-code' => $query->orderByDesc('code'),
            'created' => $query->orderBy('created_on_phone_at')->orderBy('id'),
            default => $query->orderByDesc('created_on_phone_at')->orderByDesc('id'),
        };

        return BoxResource::collection($query->paginate(50)->withQueryString());
    }

    /** Values for the filter drop-downs. */
    public function filters(): JsonResponse
    {
        return response()->json([
            'agents' => Box::whereNotNull('agent_name')->distinct()->orderBy('agent_name')->pluck('agent_name'),
            'rooms' => Box::whereNotNull('room')->distinct()->orderBy('room')->pluck('room'),
            'devices' => Device::orderBy('letter')->pluck('letter'),
            'statuses' => Box::selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status'),
        ]);
    }

    public function show(Box $box): BoxResource
    {
        $box->load(['device', 'images.document.reviewer']);
        $box->pending_conflicts = BoxConflict::where('existing_box_id', $box->id)->where('status', 'pending')->count();

        return new BoxResource($box);
    }

    /** Admin: fix a code that was miswritten on the box (audited, photos moved, index updated). */
    public function updateCode(Request $request, Box $box, BoxCodeCorrector $corrector): BoxResource
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:20']]);
        $corrector->correct($box, $data['code']);

        return $this->show($box->fresh());
    }
}
