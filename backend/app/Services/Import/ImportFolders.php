<?php

namespace App\Services\Import;

use RuntimeException;

/**
 * The import folders under ARCHIVE_ROOT:
 *   import/ (watched) → processing/ → imported/  or  failed/ (+ .txt explaining why)
 */
class ImportFolders
{
    public function path(string $folder, string $file = ''): string
    {
        $dir = rtrim(config('archive.root'), '/')."/{$folder}";
        if (! is_dir($dir) && ! mkdir($dir, 0775, true) && ! is_dir($dir)) {
            throw new RuntimeException("Cannot create {$dir}");
        }

        return $file === '' ? $dir : "{$dir}/{$file}";
    }

    /** ZIP files waiting in the watched folder. */
    public function waiting(): array
    {
        return array_values(array_filter(
            glob($this->path('import').'/*') ?: [],
            fn (string $f) => is_file($f) && strtolower(pathinfo($f, PATHINFO_EXTENSION)) === 'zip',
        ));
    }

    /**
     * Moves a file into processing/ (atomic claim: a file can only be imported once
     * even if two scans run at the same time). Returns the new path, or null if
     * someone else claimed it first.
     */
    public function claim(string $file): ?string
    {
        $target = $this->uniqueTarget('processing', basename($file));

        return @rename($file, $target) ? $target : null;
    }

    /** Moves an uploaded file (from the app's private storage) into processing/. */
    public function adopt(string $file, string $name): string
    {
        $target = $this->uniqueTarget('processing', $this->safeName($name));
        if (! rename($file, $target)) {
            throw new RuntimeException("Cannot move {$file} to {$target}");
        }

        return $target;
    }

    /**
     * Final destination: imported/ or failed/. For failures, an "<name>.erreur.txt"
     * explaining the problem is written next to the ZIP.
     */
    public function archive(string $file, bool $failed, ImportReport $report, string $originalName): string
    {
        $target = $this->uniqueTarget($failed ? 'failed' : 'imported', $this->safeName($originalName));
        if (! rename($file, $target)) {
            throw new RuntimeException("Cannot move {$file} to {$target}");
        }
        if ($failed) {
            file_put_contents(preg_replace('/\.zip$/i', '', $target).'.erreur.txt', $report->toText($originalName));
        }

        return $target;
    }

    private function uniqueTarget(string $folder, string $name): string
    {
        $base = preg_replace('/\.zip$/i', '', $name);
        $target = $this->path($folder, "{$base}.zip");
        for ($n = 2; file_exists($target); $n++) {
            $target = $this->path($folder, "{$base}_{$n}.zip");
        }

        return $target;
    }

    private function safeName(string $name): string
    {
        $name = preg_replace('/[^A-Za-z0-9._-]+/', '_', basename($name)) ?: 'export.zip';

        return str_ends_with(strtolower($name), '.zip') ? $name : "{$name}.zip";
    }
}
