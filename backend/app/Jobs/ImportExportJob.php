<?php

namespace App\Jobs;

use App\Enums\ImportStatus;
use App\Models\Import;
use App\Services\Import\ExportImporter;
use App\Services\Import\ImportFolders;
use App\Services\Import\ImportReport;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Imports one ZIP that is waiting in processing/, then moves it to imported/ or failed/.
 * Not retried automatically: a failed import is explained in its report and the ZIP
 * can simply be dropped again.
 */
class ImportExportJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 3600;
    public int $tries = 1;

    public function __construct(public int $importId, public string $path)
    {
        $this->onQueue('imports');
    }

    public function handle(ExportImporter $importer, ImportFolders $folders): void
    {
        $import = Import::findOrFail($this->importId);
        $report = $importer->run($import, $this->path);

        $import->update([
            'archived_path' => $folders->archive($this->path, $import->status === ImportStatus::Failed, $report, $import->file_name),
        ]);
    }

    /** Unexpected crash (bug, disk full...): record it and move the ZIP to failed/. */
    public function failed(Throwable $e): void
    {
        $import = Import::find($this->importId);
        if (! $import) {
            return;
        }

        $report = new ImportReport;
        $report->fatal = 'Erreur interne pendant l\'import : '.$e->getMessage();
        $import->update(['status' => ImportStatus::Failed, 'report' => $report->toArray(), 'imported_at' => now()]);

        if (is_file($this->path)) {
            $import->update(['archived_path' => app(ImportFolders::class)->archive($this->path, true, $report, $import->file_name)]);
        }
    }
}
