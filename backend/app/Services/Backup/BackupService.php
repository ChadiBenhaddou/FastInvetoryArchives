<?php

namespace App\Services\Backup;

use App\Models\Backup;
use App\Models\Image;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Backup = one folder under ARCHIVE_ROOT/backups/<date>/:
 *   database.sql.gz   consistent dump of MySQL (Docker)
 *   database.sqlite.gz   or: copy of the SQLite database (portable Windows mode)
 *   search.dump       Meilisearch dump (the index can also be rebuilt from the database)
 *   photos.csv        every photo path + SHA-256, to verify a copy of the photos folder
 *   backup.json       what is inside, app version, counts
 * The photos themselves are already plain files (ARCHIVE_ROOT/storage, or ARCHIVE_PHOTOS_PATH); the
 * "backup to USB" script mirrors that folder + the latest backup folder to the drive
 * (incremental: only new photos are copied).
 */
class BackupService
{
    public const KEEP = 7;

    public function __construct(
        private readonly MysqlDumper $mysql,
        private readonly SqliteDumper $sqlite,
    ) {}

    public function root(): string
    {
        return rtrim(config('archive.root'), '/').'/backups';
    }

    public function run(Backup $backup): Backup
    {
        $dir = $this->root().'/'.$backup->folder;
        File::ensureDirectoryExists($dir);

        $tables = DB::getDriverName() === 'sqlite'
            ? $this->sqlite->dump("{$dir}/database.sqlite.gz")
            : $this->mysql->dump("{$dir}/database.sql.gz");
        $search = $this->searchDump($dir);
        $photos = $this->photoList("{$dir}/photos.csv");

        $summary = [
            'app_version' => config('archive.version'),
            'created_at' => now()->toIso8601String(),
            'tables' => $tables,
            'photos' => $photos,
            'search_dump' => $search,
            'photos_folder' => config('archive.host_photos'),
        ];
        file_put_contents("{$dir}/backup.json", json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        $backup->update([
            'status' => 'done',
            'size_bytes' => collect(File::files($dir))->sum(fn ($f) => $f->getSize()),
            'summary' => $summary,
            'finished_at' => now(),
        ]);
        $this->prune();

        return $backup;
    }

    /** Asks Meilisearch for a dump and moves it into the backup folder. Not fatal if it fails. */
    private function searchDump(string $dir): bool
    {
        try {
            $client = Http::baseUrl(rtrim(config('archive.meilisearch.host'), '/'))
                ->withToken(config('archive.meilisearch.key'))->timeout(30);
            $uid = $client->post('/dumps')->throw()->json('taskUid');
            for ($i = 0; $i < 600; $i++) {
                $task = $client->get("/tasks/{$uid}")->throw()->json();
                if ($task['status'] === 'succeeded') {
                    $file = $this->root().'/.search-dumps/'.$task['details']['dumpUid'].'.dump';
                    if (! is_file($file)) {
                        return false;
                    }

                    // The dump is written by the Meilisearch container (other owner): copy if it cannot be moved.
                    return @rename($file, "{$dir}/search.dump") || (copy($file, "{$dir}/search.dump") && (@unlink($file) || true));
                }
                if ($task['status'] === 'failed') {
                    return false;
                }
                usleep(500_000);
            }
        } catch (\Throwable) {
            // The database dump is what matters; the index can be rebuilt from it.
        }

        return false;
    }

    private function photoList(string $file): int
    {
        $out = fopen($file, 'wb') ?: throw new RuntimeException("Cannot write {$file}");
        fputcsv($out, ['path', 'sha256', 'bytes']);
        $count = 0;
        Image::select(['id', 'path', 'checksum', 'file_size'])->chunkById(2000, function ($images) use ($out, &$count) {
            foreach ($images as $img) {
                fputcsv($out, [$img->path, $img->checksum, $img->file_size]);
                $count++;
            }
        });
        fclose($out);

        return $count;
    }

    /** Keeps the most recent backups on the PC (the USB copies are kept by the user). */
    private function prune(): void
    {
        Backup::where('status', 'done')->latest('id')->skip(self::KEEP)->take(100)->get()
            ->each(function (Backup $old) {
                File::deleteDirectory($this->root().'/'.$old->folder);
                $old->update(['status' => 'pruned']);
            });
    }
}
