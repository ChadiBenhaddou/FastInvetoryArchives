<?php

namespace App\Services\Backup;

use Illuminate\Support\Facades\DB;
use PDO;
use RuntimeException;

/**
 * Consistent gzip'd copy of the SQLite database (portable Windows mode, no Docker).
 * VACUUM INTO writes a snapshot while imports and OCR keep running.
 * Restorable by un-gzipping it in place of database/archive.sqlite (app stopped).
 */
class SqliteDumper
{
    /** @return array<string, int> rows per table */
    public function dump(string $file): array
    {
        $pdo = DB::connection()->getPdo();
        if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'sqlite') {
            throw new RuntimeException('Database copy requires SQLite.');
        }
        $snapshot = $file.'.tmp';
        @unlink($snapshot);
        $pdo->exec('VACUUM INTO '.$pdo->quote($snapshot));

        try {
            $copy = new PDO('sqlite:'.$snapshot, options: [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $counts = [];
            $tables = $copy->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
                ->fetchAll(PDO::FETCH_COLUMN);
            foreach ($tables as $table) {
                $counts[$table] = (int) $copy->query('SELECT count(*) FROM "'.str_replace('"', '""', $table).'"')->fetchColumn();
            }
            $copy = null;

            $in = fopen($snapshot, 'rb') ?: throw new RuntimeException("Cannot read {$snapshot}");
            $gz = gzopen($file, 'wb6') ?: throw new RuntimeException("Cannot write {$file}");
            while (! feof($in)) {
                gzwrite($gz, fread($in, 1 << 20));
            }
            fclose($in);
            gzclose($gz);
        } finally {
            @unlink($snapshot);
        }

        return $counts;
    }
}
