<?php

use App\Models\UploadSession;
use Illuminate\Support\Facades\Schedule;

// Watched import folder.
Schedule::command('archive:scan-imports')->everyFifteenSeconds()->withoutOverlapping();

// Browser uploads abandoned halfway (tab closed, cable pulled...).
Schedule::call(function () {
    UploadSession::whereNull('import_id')->where('updated_at', '<', now()->subDays(2))->get()
        ->each(function (UploadSession $upload) {
            @unlink($upload->partPath());
            $upload->delete();
        });
})->daily()->name('purge-abandoned-uploads');
