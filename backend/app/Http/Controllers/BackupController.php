<?php

namespace App\Http\Controllers;

use App\Jobs\BackupJob;
use App\Models\AuditLog;
use App\Models\Backup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BackupController extends Controller
{
    public function index(): JsonResponse
    {
        $last = Backup::lastSuccessful();

        return response()->json([
            'data' => Backup::with('creator')->whereIn('status', ['running', 'done', 'failed'])->latest('id')->limit(30)->get()
                ->map(fn (Backup $b) => [
                    'id' => $b->id,
                    'folder' => rtrim(config('archive.host_root'), '/\\').'/backups/'.$b->folder,
                    'status' => $b->status,
                    'size_bytes' => $b->size_bytes,
                    'photos' => $b->summary['photos'] ?? null,
                    'search_dump' => $b->summary['search_dump'] ?? null,
                    'error' => $b->error,
                    'created_by' => $b->creator?->name,
                    'created_at' => $b->created_at?->toIso8601String(),
                    'finished_at' => $b->finished_at?->toIso8601String(),
                ]),
            'last_success_at' => $last?->finished_at?->toIso8601String(),
            'photos_folder' => config('archive.host_photos'),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        if (Backup::where('status', 'running')->where('created_at', '>', now()->subHours(2))->exists()) {
            return response()->json(['message' => 'Une sauvegarde est déjà en cours.'], 409);
        }
        $backup = Backup::create([
            'folder' => now()->format('Y-m-d_His'),
            'status' => 'running',
            'created_by' => $request->user()->id,
        ]);
        AuditLog::record('backup', $backup);
        BackupJob::dispatch($backup->id)->onQueue('imports');

        return response()->json(['data' => ['id' => $backup->id]], 202);
    }
}
