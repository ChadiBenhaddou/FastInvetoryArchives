<?php

use App\Models\UploadSession;
use Illuminate\Support\Facades\Schedule;

// Watched import folder. The overlap lock expires after 5 minutes (a scan takes
// seconds): the default 24 h would freeze the folder for a day after a crash or power cut.
Schedule::command('archive:scan-imports')->everyFifteenSeconds()->withoutOverlapping(5);

// Browser uploads abandoned halfway (tab closed, cable pulled...).
Schedule::call(function () {
    UploadSession::whereNull('import_id')->where('updated_at', '<', now()->subDays(2))->get()
        ->each(function (UploadSession $upload) {
            @unlink($upload->partPath());
            $upload->delete();
        });
})->daily()->name('purge-abandoned-uploads');
