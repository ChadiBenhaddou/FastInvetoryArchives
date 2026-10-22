<?php

namespace App\Http\Controllers;

use App\Services\Ocr\OcrClient;
use App\Services\Pipeline;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Status of the local services, shown on the dashboard.
 */
class SystemController extends Controller
{
    public function status(OcrClient $ocr): JsonResponse
    {
        $root = config('archive.root');

        return response()->json([
            'version' => config('archive.version'),
            'services' => [
                'database' => $this->check(fn () => DB::select('select 1')),
                'search' => $this->check(fn () => Http::timeout(3)
                    ->get(rtrim(config('archive.meilisearch.host'), '/').'/health')
                    ->throw()),
                'ocr' => $this->check(fn () => $ocr->healthy() ?: throw new \RuntimeException('OCR worker not ready')),
            ],
            'queue' => [
                'pending' => DB::table('jobs')->count(),
                'failed' => DB::table('failed_jobs')->count(),
            ],
            'folders' => collect(['import', 'imported', 'failed', 'storage', 'backups'])
                ->mapWithKeys(fn ($f) => [$f => rtrim(config('archive.host_root'), '/\\').'/'.$f]),
            'disk' => is_dir($root) ? [
                'free_bytes' => disk_free_space($root),
                'total_bytes' => disk_total_space($root),
            ] : null,
        ]);
    }

    public function pipeline(Pipeline $pipeline): JsonResponse
    {
        return response()->json($pipeline->status());
    }

    private function check(callable $probe): array
    {
        try {
            $probe();

            return ['ok' => true];
        } catch (Throwable $e) {
            return ['ok' => false, 'error' => $e->getMessage()];
        }
    }
}
