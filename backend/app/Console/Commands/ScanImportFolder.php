<?php

namespace App\Console\Commands;

use App\Enums\ImportStatus;
use App\Jobs\ImportExportJob;
use App\Models\Import;
use App\Services\Import\ImportFolders;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

/**
 * Watched folder: every ZIP copied into ARCHIVE_ROOT/import is imported automatically.
 * A file is only picked up once it has stopped changing (it may still be copying from
 * the phone or the USB drive). Polling is used because file-change notifications do not
 * cross the Windows ↔ Docker boundary.
 */
#[Signature('archive:scan-imports')]
#[Description('Queue the ZIP files waiting in the watched import folder')]
class ScanImportFolder extends Command
{
    public function handle(ImportFolders $folders): int
    {
        $stableFor = config('archive.import.stable_seconds');

        foreach ($folders->waiting() as $file) {
            clearstatcache(true, $file);
            $size = @filesize($file);
            $mtime = @filemtime($file);
            if ($size === false || $mtime === false) {
                continue;
            }

            // Same size as at the previous scan and untouched for a while → copy finished.
            $key = 'import-scan:'.md5($file);
            $previous = Cache::get($key);
            Cache::put($key, $size, now()->addHour());
            if ($size === 0 || $previous !== $size || time() - $mtime < $stableFor) {
                continue;
            }

            $name = basename($file);
            $claimed = $folders->claim($file);
            if (! $claimed) {
                continue; // picked up by a concurrent scan
            }
            Cache::forget($key);

            $import = Import::create([
                'file_name' => $name,
                'file_size' => $size,
                'source' => 'watched_folder',
                'status' => ImportStatus::Pending,
            ]);
            ImportExportJob::dispatch($import->id, $claimed);
            $this->info("Queued {$name} (import #{$import->id})");
        }

        return self::SUCCESS;
    }
}
