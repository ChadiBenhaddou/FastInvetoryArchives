<?php

namespace App\Services\Backup;

use Illuminate\Support\Facades\DB;
use PDO;
use RuntimeException;

/**
 * Consistent gzip'd SQL dump of the MySQL database, in PHP (no mysqldump in the app image).
 * Restorable with the standard client:  gunzip -c database.sql.gz | mysql archive
 */
class MysqlDumper
{
    /** Volatile tables: not worth backing up. */
    private const SKIP_DATA = ['cache', 'cache_locks', 'sessions'];

    /** @return array<string, int> rows per table */
    public function dump(string $file): array
    {
        $pdo = DB::connection()->getPdo();
        if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'mysql') {
            throw new RuntimeException('Database dump requires MySQL.');
        }
        $gz = gzopen($file, 'wb6') ?: throw new RuntimeException("Cannot write {$file}");
        $out = fn (string $s) => gzwrite($gz, $s);

        // One snapshot for every table: the dump is consistent even while imports run.
        $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        $pdo->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT');

        $out("-- Archive inventory database dump\n-- ".now()->toIso8601String()."\n");
        $out("SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\n\n");

        $counts = [];
        $tables = $pdo->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")->fetchAll(PDO::FETCH_COLUMN, 0);
        // Stream rows instead of loading whole tables (100k OCR texts would not fit in memory).
        $buffered = $pdo->getAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY);
        $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);
        try {
            foreach ($tables as $table) {
                $stmt = $pdo->query("SHOW CREATE TABLE `{$table}`");
                $create = $stmt->fetch(PDO::FETCH_NUM)[1];
                $stmt->closeCursor();
                $out("DROP TABLE IF EXISTS `{$table}`;\n{$create};\n\n");
                if (in_array($table, self::SKIP_DATA, true)) {
                    continue;
                }
                $counts[$table] = $this->dumpRows($pdo, $table, $out);
            }
        } finally {
            $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, $buffered);
        }

        $pdo->exec('COMMIT');
        $out("SET FOREIGN_KEY_CHECKS=1;\nSET UNIQUE_CHECKS=1;\n");
        gzclose($gz);

        return $counts;
    }

    private function dumpRows(PDO $pdo, string $table, callable $out): int
    {
        $stmt = $pdo->query("SELECT * FROM `{$table}`", PDO::FETCH_NUM);
        $columns = null;
        $batch = [];
        $count = 0;
        $flush = function () use (&$batch, &$columns, $table, $out) {
            if ($batch) {
                $out("INSERT INTO `{$table}` ({$columns}) VALUES\n".implode(",\n", $batch).";\n");
                $batch = [];
            }
        };

        while ($row = $stmt->fetch()) {
            if ($columns === null) {
                $names = [];
                for ($i = 0; $i < $stmt->columnCount(); $i++) {
                    $names[] = '`'.$stmt->getColumnMeta($i)['name'].'`';
                }
                $columns = implode(', ', $names);
            }
            $batch[] = '('.implode(', ', array_map(fn ($v) => $v === null ? 'NULL' : $pdo->quote((string) $v), $row)).')';
            $count++;
            if (count($batch) >= 200) {
                $flush();
            }
        }
        $flush();
        $stmt->closeCursor();
        $out("\n");

        return $count;
    }
}
