<?php

namespace App\Http\Controllers;

use App\Models\Backup;
use App\Models\Box;
use App\Models\BoxConflict;
use App\Models\Device;
use App\Models\Image;
use App\Services\SequenceGaps;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function __invoke(SequenceGaps $gaps): JsonResponse
    {
        $since = now()->subDays(13)->startOfDay();

        // Photos per agent per day (capture date on the phone), last 14 days.
        $perDay = Image::join('boxes', 'boxes.id', '=', 'images.box_id')
            ->where('images.taken_at', '>=', $since)
            ->selectRaw('boxes.agent_name as agent, DATE(images.taken_at) as day, count(*) as photos')
            ->groupBy('agent', 'day')
            ->orderBy('day')
            ->get();

        $last = Backup::lastSuccessful();
        $hasData = Box::exists();

        return response()->json([
            'days' => collect(range(13, 0))->map(fn ($i) => now()->subDays($i)->format('Y-m-d')),
            'photos_per_agent_per_day' => $perDay->groupBy('agent')->map(fn ($rows) => $rows->pluck('photos', 'day')),
            'boxes_today' => Box::where('created_at', '>=', now()->startOfDay())->count(),
            'photos_total' => Image::count(),
            'gaps' => Device::orderBy('letter')->get()
                ->map(fn (Device $d) => ['device' => $d->letter, 'label' => $d->label, 'gaps' => $gaps->forDevice($d)])
                ->filter(fn ($row) => $row['gaps'])->values(),
            'conflicts_pending' => BoxConflict::where('status', 'pending')->count(),
            'backup' => [
                'last_success_at' => $last?->finished_at?->toIso8601String(),
                // Reminder when nothing was saved in the last 24 h (and there is something to save).
                'reminder' => $hasData && (! $last || $last->finished_at->lt(now()->subDay())),
            ],
            'database_bytes' => DB::getDriverName() === 'mysql'
                ? (int) DB::table('information_schema.tables')->where('table_schema', DB::getDatabaseName())
                    ->sum(DB::raw('data_length + index_length'))
                : null,
        ]);
    }
}
