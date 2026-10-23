<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\Backup;
use App\Services\Backup\BackupService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Throwable;

/** Used by the "backup to USB" script: makes the backup and prints its folder. */
#[Signature('archive:backup')]
#[Description('Back up the database and the search index into ARCHIVE_ROOT/backups/<date>')]
class RunBackup extends Command
{
    public function handle(BackupService $service): int
    {
        $backup = Backup::create(['folder' => now()->format('Y-m-d_His'), 'status' => 'running']);
        try {
            $service->run($backup);
        } catch (Throwable $e) {
            $backup->update(['status' => 'failed', 'error' => $e->getMessage(), 'finished_at' => now()]);
            $this->error('Échec de la sauvegarde : '.$e->getMessage());

            return self::FAILURE;
        }
        AuditLog::record('backup', $backup);
        $this->line($backup->folder);

        return self::SUCCESS;
    }
}
