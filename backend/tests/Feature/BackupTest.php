<?php

namespace Tests\Feature;

use App\Models\Backup;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use PDO;
use Tests\TestCase;

/** Portable Windows mode: the backup of the SQLite database is a copy of it, not an SQL dump. */
class BackupTest extends TestCase
{
    // Not RefreshDatabase: SQLite cannot VACUUM INTO inside the transaction it wraps each test in.
    use DatabaseMigrations;

    private string $root;

    protected function setUp(): void
    {
        parent::setUp();
        $this->root = sys_get_temp_dir().'/archive-backup-test-'.uniqid();
        config(['archive.root' => $this->root]);
        // Search engine down: its dump is skipped, the database copy is what matters.
        Http::fake(['*' => Http::response('', 503)]);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->root);
        parent::tearDown();
    }

    public function test_sqlite_backup_is_a_readable_copy_of_the_database(): void
    {
        User::factory()->create(['username' => 'agent1']);

        $this->artisan('archive:backup')->assertSuccessful();

        $backup = Backup::firstOrFail();
        $this->assertSame('done', $backup->status);
        $this->assertSame(1, $backup->summary['tables']['users']);
        $this->assertFalse($backup->summary['search_dump']);

        $gz = "{$this->root}/backups/{$backup->folder}/database.sqlite.gz";
        $this->assertFileExists($gz);
        $this->assertFileDoesNotExist("{$gz}.tmp");
        $copy = "{$this->root}/restored.sqlite";
        file_put_contents($copy, gzdecode(file_get_contents($gz)));
        $db = new PDO('sqlite:'.$copy);
        $this->assertSame('ok', $db->query('PRAGMA integrity_check')->fetchColumn());
        $this->assertSame('agent1', $db->query('SELECT username FROM users')->fetchColumn());
        $db = null;
    }
}
