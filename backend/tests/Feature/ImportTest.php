<?php

namespace Tests\Feature;

use App\Enums\ImageType;
use App\Enums\ImportStatus;
use App\Enums\OcrStatus;
use App\Events\BoxImported;
use App\Jobs\ImportExportJob;
use App\Models\Box;
use App\Models\BoxConflict;
use App\Models\Device;
use App\Models\Image;
use App\Models\Import;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Tests\Support\ExportZipBuilder;
use Tests\TestCase;

class ImportTest extends TestCase
{
    use RefreshDatabase;

    private string $root;
    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();
        $this->root = sys_get_temp_dir().'/archive-test-'.uniqid();
        config(['archive.root' => $this->root, 'archive.import.manifest_schema' => dirname(base_path()).'/shared/manifest.schema.json']);
        Storage::fake('archive');
        // The processing pipeline has its own tests (PipelineTest): here imports stay imports.
        Event::fake([BoxImported::class]);
        $this->device = Device::factory()->create(['letter' => 'A']);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->root);
        parent::tearDown();
    }

    /** Builds the ZIP in processing/ and runs the import job like the queue would. */
    private function import(ExportZipBuilder|string $zip, string $name = 'A_20261022_1800_2boxes.zip'): Import
    {
        File::ensureDirectoryExists("{$this->root}/processing");
        $path = "{$this->root}/processing/{$name}";
        is_string($zip) ? file_put_contents($path, $zip) : $zip->build($path);

        $import = Import::create(['file_name' => $name, 'source' => 'upload', 'status' => ImportStatus::Pending]);
        ImportExportJob::dispatchSync($import->id, $path);

        return $import->fresh();
    }

    public function test_imports_a_valid_export(): void
    {
        Event::fake([BoxImported::class]);

        $import = $this->import(ExportZipBuilder::make()->box(1, photos: 3)->box(2, photos: 2));

        $this->assertSame(ImportStatus::Completed, $import->status);
        $this->assertSame(['boxes_added' => 2, 'photos_added' => 5, 'duplicates_skipped' => 0, 'conflicts' => 0, 'errors' => 0], $import->report['summary']);
        $this->assertSame(2, $import->box_count);
        $this->assertSame('A', $import->device->letter);

        $box = Box::where('code', 'A-0001-C')->firstOrFail();
        $this->assertSame(['Salle 1', 'B', null], [$box->room, $box->shelf, $box->row]);
        $this->assertSame(3, $box->images()->count());

        $codePhoto = $box->images()->where('sequence', 0)->first();
        $this->assertSame(ImageType::CodePhoto, $codePhoto->type);
        $this->assertSame(OcrStatus::Skipped, $codePhoto->ocr_status);
        $this->assertSame(OcrStatus::Pending, $box->images()->where('sequence', 1)->first()->ocr_status);
        $this->assertSame('A-0001-C/000.jpg', $codePhoto->path);
        Storage::disk('archive')->assertExists(['A-0001-C/000.jpg', 'A-0001-C/001.jpg', 'A-0001-C/002.jpg']);
        $this->assertSame($codePhoto->checksum, hash('sha256', Storage::disk('archive')->get('A-0001-C/000.jpg')));
        $this->assertSame([64, 48], [$codePhoto->width, $codePhoto->height]);
        Storage::disk('archive')->assertMissing("_staging/{$import->id}");

        $this->assertSame(2, $this->device->fresh()->last_sequence_seen);
        $this->assertFileExists("{$this->root}/imported/A_20261022_1800_2boxes.zip");
        $this->assertSame("{$this->root}/imported/A_20261022_1800_2boxes.zip", $import->archived_path);
        Event::assertDispatchedTimes(BoxImported::class, 2);
    }

    public function test_an_export_already_imported_is_skipped(): void
    {
        $zip = ExportZipBuilder::make()->box(1);
        $first = $this->import($zip, 'first.zip');
        $second = $this->import($zip, 'again.zip');

        $this->assertSame(ImportStatus::Completed, $first->status);
        $this->assertSame(ImportStatus::Duplicate, $second->status);
        $this->assertSame($first->id, $second->report['duplicate_of']);
        $this->assertNull($second->export_id);
        $this->assertSame(['A', 'Agent Test'], [$second->device->letter, $second->agent_name]); // still informative
        $this->assertSame(1, Box::count());
        $this->assertFileExists("{$this->root}/imported/again.zip");
    }

    public function test_a_box_with_identical_photos_in_another_export_is_skipped(): void
    {
        $this->import(ExportZipBuilder::make()->box(1), 'a.zip');
        $second = $this->import(ExportZipBuilder::make()->box(1)->box(2), 'b.zip'); // re-exported box 1

        $this->assertSame(ImportStatus::Completed, $second->status);
        $this->assertSame(['A-0001-C'], $second->report['duplicates']);
        $this->assertSame(['A-0002-D'], $second->report['boxes_added']);
        $this->assertSame(3, Image::whereHas('box', fn ($q) => $q->where('code', 'A-0001-C'))->count());
    }

    public function test_same_code_with_different_photos_is_a_conflict_for_review(): void
    {
        $this->import(ExportZipBuilder::make()->box(1), 'a.zip');
        $originalChecksum = Image::where('sequence', 1)->value('checksum');

        $second = $this->import(ExportZipBuilder::make()->box(1, photos: 4, seed: 7), 'b.zip');

        $this->assertSame(ImportStatus::CompletedWithIssues, $second->status);
        $this->assertSame('A-0001-C', $second->report['conflicts'][0]['code']);
        $conflict = BoxConflict::firstOrFail();
        $this->assertSame('pending', $conflict->status);
        $this->assertSame(Box::where('code', 'A-0001-C')->value('id'), $conflict->existing_box_id);
        Storage::disk('archive')->assertExists("_conflicts/{$second->id}/A-0001-C/003.jpg");
        // The box already on the PC is left untouched.
        $this->assertSame($originalChecksum, Image::where('sequence', 1)->value('checksum'));
        $this->assertSame(3, Box::firstOrFail()->photo_count);

        // Importing the same conflicting file again does not create a second conflict.
        $this->import(ExportZipBuilder::make()->box(1, photos: 4, seed: 7), 'c.zip');
        $this->assertSame(1, BoxConflict::count());
    }

    public function test_a_corrupted_photo_rejects_only_its_box(): void
    {
        $import = $this->import(ExportZipBuilder::make()->box(1)->box(2)->corrupt('boxes/A-0002-D/001.jpg'));

        $this->assertSame(ImportStatus::CompletedWithIssues, $import->status);
        $this->assertSame(['A-0001-C'], $import->report['boxes_added']);
        $this->assertSame('A-0002-D', $import->report['errors'][0]['code']);
        $this->assertStringContainsString('corrompue', $import->report['errors'][0]['message']);
        $this->assertNull(Box::where('code', 'A-0002-D')->first());
        Storage::disk('archive')->assertMissing('A-0002-D');
        $this->assertFileExists("{$this->root}/imported/A_20261022_1800_2boxes.zip");
    }

    public function test_a_missing_photo_rejects_its_box(): void
    {
        $import = $this->import(ExportZipBuilder::make()->box(1)->omit('boxes/A-0001-C/002.jpg'));

        $this->assertSame([], $import->report['boxes_added']);
        $this->assertStringContainsString('Photo manquante', $import->report['errors'][0]['message']);
    }

    public function test_a_wrong_check_letter_is_rejected(): void
    {
        $import = $this->import(ExportZipBuilder::make()->box(1, code: 'A-0001-D'));

        $this->assertSame('A-0001-D', $import->report['errors'][0]['code']);
        $this->assertStringContainsString('lettre de contrôle', $import->report['errors'][0]['message']);
        $this->assertSame(0, Box::count());
    }

    public function test_unknown_device_fails_and_explains_why_next_to_the_zip(): void
    {
        $import = $this->import(ExportZipBuilder::make('C')->box(1), 'C_export.zip');

        $this->assertSame(ImportStatus::Failed, $import->status);
        $this->assertStringContainsString('inconnu', $import->report['fatal']);
        $this->assertFileExists("{$this->root}/failed/C_export.zip");
        $this->assertStringContainsString('inconnu', file_get_contents("{$this->root}/failed/C_export.erreur.txt"));
    }

    public function test_invalid_manifest_is_rejected_with_details(): void
    {
        $import = $this->import(ExportZipBuilder::make()->box(1)->withManifest(['device_letter' => 'O']));

        $this->assertSame(ImportStatus::Failed, $import->status);
        $this->assertStringContainsString('format attendu', $import->report['fatal']);
        $this->assertNotEmpty($import->report['fatal_details']);
    }

    public function test_unsupported_app_version_is_rejected(): void
    {
        $import = $this->import(ExportZipBuilder::make()->box(1)->appVersion('2.0.0'));

        $this->assertSame(ImportStatus::Failed, $import->status);
        $this->assertStringContainsString('2.0.0', $import->report['fatal']);
    }

    public function test_a_file_that_is_not_a_zip_fails_cleanly(): void
    {
        $import = $this->import('this is not a zip', 'broken.zip');

        $this->assertSame(ImportStatus::Failed, $import->status);
        $this->assertStringContainsString('illisible', $import->report['fatal']);
        $this->assertFileExists("{$this->root}/failed/broken.erreur.txt");
    }

    public function test_gaps_ignore_voided_and_open_boxes(): void
    {
        $import = $this->import(ExportZipBuilder::make()->box(1)->box(2)->box(5)->voided(3)->open(7)->lastIssued(7));

        $this->assertSame([3], $import->report['voided']);
        $this->assertSame([
            ['from' => 4, 'to' => 4, 'count' => 1, 'first_code' => 'A-0004-F', 'last_code' => 'A-0004-F'],
            ['from' => 6, 'to' => 6, 'count' => 1, 'first_code' => 'A-0006-H', 'last_code' => 'A-0006-H'],
        ], array_map(fn ($g) => $g, $import->report['gaps']));
        $this->assertSame([7], $this->device->fresh()->open_sequences);
    }

    public function test_warns_when_the_phone_counter_goes_backwards(): void
    {
        $this->import(ExportZipBuilder::make()->box(9)->lastIssued(10), 'a.zip');
        $second = $this->import(ExportZipBuilder::make()->box(1)->lastIssued(3), 'b.zip');

        $this->assertStringContainsString('revenu en arrière', implode(' ', $second->report['warnings']));
        $this->assertSame(10, $this->device->fresh()->last_sequence_issued);
    }

    public function test_a_partially_failed_export_can_be_imported_again_once_fixed(): void
    {
        $exportId = '7d1c9a52-3b0e-4b8f-9a55-2b8f0f1d2c3e';
        $first = $this->import(ExportZipBuilder::make()->exportId($exportId)->box(1)->box(2)->corrupt('boxes/A-0002-D/001.jpg'), 'a.zip');
        $retry = $this->import(ExportZipBuilder::make()->exportId($exportId)->box(1)->box(2), 'b.zip');

        $this->assertSame(ImportStatus::CompletedWithIssues, $first->status);
        $this->assertSame(ImportStatus::Completed, $retry->status);
        $this->assertSame(['A-0001-C'], $retry->report['duplicates']);
        $this->assertSame(['A-0002-D'], $retry->report['boxes_added']);
        $this->assertSame($exportId, $retry->export_id);
        $this->assertNull($first->fresh()->export_id);
    }

    public function test_watched_folder_picks_up_a_zip_once_its_copy_is_finished(): void
    {
        config(['archive.import.stable_seconds' => 5]);
        File::ensureDirectoryExists("{$this->root}/import");
        $file = "{$this->root}/import/A_watch.zip";
        ExportZipBuilder::make()->box(1)->build($file);

        // Still being copied (just modified): ignored.
        Artisan::call('archive:scan-imports');
        Artisan::call('archive:scan-imports');
        $this->assertFileExists($file);

        // Untouched for a while and same size as at the previous scan: imported.
        touch($file, time() - 60);
        Artisan::call('archive:scan-imports');

        $this->assertFileDoesNotExist($file);
        $import = Import::firstOrFail();
        $this->assertSame('watched_folder', $import->source);
        $this->assertSame(ImportStatus::Completed, $import->status);
        $this->assertFileExists("{$this->root}/imported/A_watch.zip");
        $this->assertSame(1, Box::count());
    }

    public function test_chunked_upload_from_the_browser(): void
    {
        $user = User::factory()->create(); // reviewers may import
        $zip = ExportZipBuilder::make()->box(1)->build(tempnam(sys_get_temp_dir(), 'zip'));
        $bytes = file_get_contents($zip);
        $half = intdiv(strlen($bytes), 2);

        $id = $this->actingAs($user)
            ->postJson('/api/uploads', ['file_name' => 'A_upload.zip', 'size' => strlen($bytes)])
            ->assertCreated()->json('id');

        $put = fn (int $offset, string $chunk) => $this->call('PUT', "/api/uploads/{$id}", [], [], [], [
            'HTTP_UPLOAD_OFFSET' => (string) $offset, 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/octet-stream',
        ], $chunk);

        $put(0, substr($bytes, 0, $half))->assertOk()->assertJson(['received' => $half]);
        // A retried chunk at a stale offset is refused with the offset to resume from.
        $put(0, substr($bytes, 0, $half))->assertStatus(409)->assertJson(['received' => $half]);
        $put($half, substr($bytes, $half))->assertOk()->assertJson(['received' => strlen($bytes)]);

        $importId = $this->postJson("/api/uploads/{$id}/complete")->assertCreated()->json('data.id');

        $this->getJson("/api/imports/{$importId}")
            ->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.report.summary.boxes_added', 1);
        $this->assertSame($user->id, Import::find($importId)->imported_by);
        $this->assertFileExists("{$this->root}/imported/A_upload.zip");
        unlink($zip);
    }

    public function test_upload_refuses_non_zip_files_and_incomplete_uploads(): void
    {
        $this->actingAs(User::factory()->create());

        $this->postJson('/api/uploads', ['file_name' => 'photo.jpg', 'size' => 10])->assertStatus(422);
        $id = $this->postJson('/api/uploads', ['file_name' => 'a.zip', 'size' => 10])->json('id');
        $this->postJson("/api/uploads/{$id}/complete")->assertStatus(422);
    }

    public function test_only_admins_register_devices_and_letters_are_checked(): void
    {
        $this->actingAs(User::factory()->create())->postJson('/api/devices', ['letter' => 'C', 'label' => 'X'])->assertForbidden();

        $admin = User::factory()->admin()->create();
        $this->actingAs($admin)->postJson('/api/devices', ['letter' => 'O', 'label' => 'X'])->assertStatus(422);
        $this->actingAs($admin)->postJson('/api/devices', ['letter' => 'A', 'label' => 'X'])->assertStatus(422); // taken
        $this->actingAs($admin)->postJson('/api/devices', ['letter' => 'C', 'label' => 'Téléphone 2'])
            ->assertCreated()->assertJsonPath('data.letter', 'C');
        $this->getJson('/api/devices')->assertOk()->assertJsonCount(2, 'data');
    }
}
