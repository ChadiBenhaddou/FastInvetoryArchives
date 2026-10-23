<?php

namespace App\Jobs;

use App\Models\Backup;
use App\Services\Backup\BackupService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class BackupJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 3600;
    public int $tries = 1;

    public function __construct(public int $backupId) {}

    public function handle(BackupService $service): void
    {
        $service->run(Backup::findOrFail($this->backupId));
    }

    public function failed(Throwable $e): void
    {
        Backup::whereKey($this->backupId)->update(['status' => 'failed', 'error' => mb_substr($e->getMessage(), 0, 2000), 'finished_at' => now()]);
    }
}
