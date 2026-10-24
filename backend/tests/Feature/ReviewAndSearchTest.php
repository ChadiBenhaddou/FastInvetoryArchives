<?php

namespace Tests\Feature;

use App\Enums\BoxStatus;
use App\Enums\ImageType;
use App\Enums\OcrStatus;
use App\Jobs\IndexDocumentJob;
use App\Models\AuditLog;
use App\Models\Box;
use App\Models\BoxConflict;
use App\Models\Device;
use App\Models\Document;
use App\Models\Image;
use App\Models\Import;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\Support\ExportZipBuilder;
use Tests\TestCase;

class ReviewAndSearchTest extends TestCase
{
    use RefreshDatabase;

    private User $reviewer;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('archive');
        Queue::fake([IndexDocumentJob::class]);
        config(['archive.meilisearch.host' => 'http://search.test']);
        $this->reviewer = User::factory()->create();
        $this->admin = User::factory()->admin()->create();
    }

    /** Box in "review" with its code photo + $docs documents (real JPEG files on the fake disk). */
    private function box(string $code = 'A-0001-C', int $docs = 2): Box
    {
        $device = Device::firstOrCreate(['letter' => $code[0]], ['label' => 'Tel']);
        $box = Box::create(['code' => $code, 'device_id' => $device->id, 'sequence' => (int) substr($code, 2, 4),
            'status' => BoxStatus::Review, 'photo_count' => $docs + 1, 'room' => 'Salle 2', 'agent_name' => 'Amina']);
        for ($i = 0; $i <= $docs; $i++) {
            $path = sprintf('%s/%03d.jpg', $code, $i);
            Storage::disk('archive')->put($path, ExportZipBuilder::jpeg($i + 1));
            $img = Image::create(['box_id' => $box->id, 'sequence' => $i, 'path' => $path, 'checksum' => str_repeat('a', 64),
                'type' => $i ? ImageType::Document : ImageType::CodePhoto, 'ocr_status' => $i ? OcrStatus::Done : OcrStatus::Skipped]);
            if ($i) {
                Document::create(['box_id' => $box->id, 'image_id' => $img->id, 'ocr_text' => "Arrêté n° {$i}",
                    'doc_type' => 'arrêté', 'needs_review' => $i === 1, 'review_reasons' => $i === 1 ? ['handwritten'] : [],
                    'extraction_status' => 'done', 'index_status' => 'done']);
            }
        }

        return $box;
    }

    public function test_boxes_list_filters_and_detail(): void
    {
        $this->box('A-0001-C');
        $this->box('A-0002-D', docs: 1)->update(['room' => 'Salle 9', 'status' => BoxStatus::Done]);

        $this->actingAs($this->reviewer)->getJson('/api/boxes?room=Salle%202')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.code', 'A-0001-C')
            ->assertJsonPath('data.0.documents_count', 2)->assertJsonPath('data.0.to_review_count', 1);
        $this->getJson('/api/boxes?status=done')->assertJsonPath('data.0.code', 'A-0002-D');
        $this->getJson('/api/boxes?code=a-0001')->assertJsonCount(1, 'data');
        $this->getJson('/api/boxes/filters')->assertJsonPath('rooms', ['Salle 2', 'Salle 9']);

        $box = Box::where('code', 'A-0001-C')->first();
        $this->getJson("/api/boxes/{$box->id}")
            ->assertOk()
            ->assertJsonCount(3, 'data.images')
            ->assertJsonPath('data.images.0.type', 'code_photo')
            ->assertJsonPath('data.images.1.document.review_reasons', ['handwritten']);
    }

    public function test_photos_and_thumbnails_need_a_login(): void
    {
        $image = $this->box()->images()->first();

        $this->get("/api/images/{$image->id}")->assertUnauthorized();
        $this->actingAs($this->reviewer)->get("/api/images/{$image->id}")->assertOk()->assertHeader('Content-Type', 'image/jpeg');
        $thumb = $this->get("/api/images/{$image->id}/thumb")->assertOk();
        $this->assertNotFalse(@imagecreatefromstring($thumb->streamedContent() ?: file_get_contents($thumb->getFile()->getPathname())));
    }

    public function test_the_browser_must_revalidate_photos_because_ids_are_reused(): void
    {
        $image = $this->box()->images()->first();

        $photo = $this->actingAs($this->reviewer)->get("/api/images/{$image->id}")->assertOk();
        $this->assertStringContainsString('no-cache', $photo->headers->get('Cache-Control'));
        $this->assertStringContainsString('private', $photo->headers->get('Cache-Control'));
        $this->assertStringNotContainsString('public', $photo->headers->get('Cache-Control'));
        $etag = $photo->headers->get('ETag');
        $this->assertNotEmpty($etag);

        $this->get("/api/images/{$image->id}", ['If-None-Match' => $etag])->assertStatus(304);
        $this->get("/api/images/{$image->id}", ['If-None-Match' => '"another-photo"'])->assertOk();
    }

    public function test_review_saves_corrections_audits_them_and_closes_the_box(): void
    {
        $box = $this->box();
        [$first, $second] = $box->documents()->orderBy('id')->get()->all();

        $this->actingAs($this->reviewer)->getJson('/api/review/next')
            ->assertOk()->assertJsonPath('data.code', 'A-0001-C')->assertJsonPath('remaining', 1);

        $this->putJson("/api/documents/{$first->id}", [
            'title' => 'Arrêté de nomination', 'doc_date' => '2019-03-12', 'persons' => ['Karim Benali'], 'approve' => true,
        ])->assertOk()->assertJsonPath('data.reviewed_by', $this->reviewer->name)->assertJsonPath('data.needs_review', false);

        $log = AuditLog::where(['entity' => 'document', 'entity_id' => $first->id, 'action' => 'updated'])->firstOrFail();
        $this->assertSame($this->reviewer->id, $log->user_id);
        $this->assertSame('Arrêté de nomination', $log->after['title']);
        Queue::assertPushed(IndexDocumentJob::class, fn ($job) => $job->documentId === $first->id);
        $this->assertSame(BoxStatus::Review, $box->fresh()->status, 'one document still to review');

        $this->putJson("/api/documents/{$second->id}", ['approve' => true])->assertOk();
        $this->assertSame(BoxStatus::Done, $box->fresh()->status);
        $this->getJson('/api/review/next')->assertJsonPath('data', null);
    }

    public function test_approve_whole_box(): void
    {
        $box = $this->box();
        $this->actingAs($this->reviewer)->postJson("/api/boxes/{$box->id}/approve")->assertOk()->assertJsonPath('data.status', 'done');
        $this->assertSame(0, Document::whereNull('reviewed_at')->count());
    }

    public function test_review_validates_fields(): void
    {
        $doc = $this->box()->documents()->first();
        $this->actingAs($this->reviewer)->putJson("/api/documents/{$doc->id}", ['doc_date' => '12/03/2019', 'keywords' => array_fill(0, 9, 'x')])
            ->assertStatus(422)->assertJsonValidationErrors(['doc_date', 'keywords']);
    }

    public function test_admin_corrects_a_miswritten_box_code(): void
    {
        $box = $this->box('A-0001-C');
        Device::create(['letter' => 'C', 'label' => 'Tel C']);

        $this->actingAs($this->reviewer)->putJson("/api/boxes/{$box->id}/code", ['code' => 'C-0001-?'])->assertForbidden();
        $this->actingAs($this->admin)->putJson("/api/boxes/{$box->id}/code", ['code' => 'A-0001-D'])
            ->assertStatus(422)->assertJsonValidationErrors('code'); // wrong check letter

        $this->putJson("/api/boxes/{$box->id}/code", ['code' => 'c 0001 r'])->assertOk()->assertJsonPath('data.code', 'C-0001-R');

        $box->refresh();
        $this->assertSame('C', $box->device->letter);
        Storage::disk('archive')->assertExists('C-0001-R/001.jpg');
        Storage::disk('archive')->assertMissing('A-0001-C');
        $this->assertSame('C-0001-R/001.jpg', $box->images()->where('sequence', 1)->value('path'));
        $this->assertTrue(AuditLog::where(['action' => 'code_corrected', 'entity_id' => $box->id])->exists());
        Queue::assertPushed(IndexDocumentJob::class, 2);

        $other = $this->box('A-0002-D', docs: 1);
        $this->putJson("/api/boxes/{$other->id}/code", ['code' => 'C-0001-R'])->assertStatus(422); // already used
    }

    public function test_search_builds_filters_and_never_returns_html(): void
    {
        Http::fake(['search.test/*' => Http::response([
            'hits' => [[
                'id' => 1, 'box_id' => 1, 'box_code' => 'A-0001-C', 'image_id' => 2, 'sequence' => 1, 'room' => 'Salle 2',
                'shelf' => null, 'row' => null, 'agent_name' => 'Amina', 'doc_type' => 'arrêté', 'doc_date' => '2019-03-12',
                'needs_review' => false, 'title' => 'Arrêté', 'reference_number' => '145', 'summary' => null, 'language' => 'fr',
                '_formatted' => ['ocr_text' => "…\u{E000}Arrêté\u{E001} n° 145…", 'title' => "\u{E000}Arrêté\u{E001}"],
            ]],
            'totalHits' => 1, 'page' => 1, 'totalPages' => 1, 'facetDistribution' => ['doc_type' => ['arrêté' => 1]],
        ])]);

        $this->actingAs($this->reviewer)
            ->getJson('/api/search?q=arrêté&room=Salle%202&year_from=2000&year_to=2020&doc_type=arr%C3%AAt%C3%A9')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('hits.0.thumb_url', '/api/images/2/thumb')
            ->assertJsonPath('hits.0.location', ['room' => 'Salle 2'])
            ->assertJsonPath('hits.0.snippet', "…\u{E000}Arrêté\u{E001} n° 145…");

        Http::assertSent(function ($request) {
            $body = $request->data();

            return $body['q'] === 'arrêté'
                && $body['filter'] === ['doc_type = "arrêté"', 'year >= 2000', 'year <= 2020', 'room = "Salle 2"']
                && $body['highlightPreTag'] === "\u{E000}";
        });
        $this->assertTrue(AuditLog::where('action', 'search')->exists());
    }

    public function test_arabic_query_is_normalized_and_matches_shown_from_the_normalized_copy(): void
    {
        Http::fake(['search.test/*' => Http::response([
            'hits' => [[
                'id' => 1, 'box_id' => 1, 'box_code' => 'A-0001-C', 'image_id' => 2, 'sequence' => 1, 'room' => null,
                'shelf' => null, 'row' => null, 'agent_name' => null, 'doc_type' => null, 'doc_date' => null,
                'needs_review' => false, 'title' => null, 'reference_number' => null, 'summary' => null, 'language' => 'ar',
                // Matched only in the normalized copy: the original has no highlight.
                '_formatted' => ['ocr_text' => 'قرار الإمارة…', 'ocr_text_search' => "قرار \u{E000}الاماره\u{E001}…"],
            ]],
            'totalHits' => 1,
        ])]);

        $this->actingAs($this->reviewer)->getJson('/api/search?q='.urlencode('الإمَارَة ٢٠١٩'))
            ->assertOk()
            ->assertJsonPath('hits.0.snippet', "قرار \u{E000}الاماره\u{E001}…");

        // أ/إ → ا, harakat removed, ة → ه, ٢٠١٩ → 2019
        Http::assertSent(fn ($r) => $r->data()['q'] === 'الاماره 2019'
            && in_array('ocr_text_search', $r->data()['attributesToCrop'], true));
    }

    public function test_indexed_document_carries_normalized_copies(): void
    {
        $doc = $this->box()->documents()->first();
        $doc->update(['ocr_text' => 'وزارة الداخلية — قرار رقم ١٤٥', 'title' => 'مُذكّرة']);

        $sent = app(\App\Services\Search\SearchIndex::class)->toSearchDocument($doc->fresh());

        $this->assertSame('وزارة الداخلية — قرار رقم ١٤٥', $sent['ocr_text']); // the original is kept
        $this->assertSame('وزاره الداخليه — قرار رقم 145', $sent['ocr_text_search']);
        $this->assertSame('مذكره', $sent['title_search']);
    }

    public function test_search_filter_values_are_escaped(): void
    {
        Http::fake(['search.test/*' => Http::response(['hits' => [], 'totalHits' => 0])]);
        $this->actingAs($this->reviewer)->getJson('/api/search?room='.urlencode('Salle "B" OR 1=1'))->assertOk();
        Http::assertSent(fn ($r) => $r->data()['filter'] === ['room = "Salle \"B\" OR 1=1"']);
    }

    public function test_conflict_resolved_as_a_new_box_with_the_corrected_code(): void
    {
        Queue::fake(); // the pipeline of the new box is not run here
        $existing = $this->box('A-0001-C');
        $import = Import::create(['file_name' => 'x.zip', 'source' => 'upload', 'status' => 'completed_with_issues', 'agent_name' => 'Youssef']);
        $incoming = (new ExportZipBuilder('A'))->box(1, photos: 2, seed: 5)->manifest()['boxes'][0];
        foreach ($incoming['photos'] as $p) {
            Storage::disk('archive')->put(sprintf('_conflicts/%d/A-0001-C/%03d.jpg', $import->id, $p['sequence']), ExportZipBuilder::jpeg($p['sequence'] + 99));
        }
        $conflict = BoxConflict::create(['import_id' => $import->id, 'device_id' => $existing->device_id, 'code' => 'A-0001-C',
            'existing_box_id' => $existing->id, 'incoming' => $incoming, 'incoming_path' => "_conflicts/{$import->id}/A-0001-C"]);

        $this->actingAs($this->reviewer)->getJson('/api/conflicts')->assertForbidden();
        $this->actingAs($this->admin)->getJson("/api/conflicts/{$conflict->id}")
            ->assertOk()->assertJsonCount(3, 'data.existing.photos')->assertJsonCount(2, 'data.incoming.photos');
        $this->get("/api/conflicts/{$conflict->id}/photos/1?thumb=1")->assertOk();

        $this->postJson("/api/conflicts/{$conflict->id}/resolve", ['action' => 'new_box', 'code' => 'A-0009-?'])->assertStatus(422);
        $this->postJson("/api/conflicts/{$conflict->id}/resolve", ['action' => 'new_box', 'code' => 'A-0009-L'])->assertOk()
            ->assertJsonPath('data.status', 'resolved')->assertJsonPath('data.resolution', 'new_box');

        $new = Box::where('code', 'A-0009-L')->firstOrFail();
        $this->assertSame(2, $new->images()->count());
        $this->assertSame('Youssef', $new->agent_name);
        Storage::disk('archive')->assertExists('A-0009-L/001.jpg');
        Storage::disk('archive')->assertMissing("_conflicts/{$import->id}/A-0001-C");
        $this->assertSame(3, $existing->images()->count(), 'existing box untouched');
        $this->postJson("/api/conflicts/{$conflict->id}/resolve", ['action' => 'keep_existing'])->assertStatus(422); // already done
    }

    public function test_excel_and_csv_export(): void
    {
        $this->box();
        $this->actingAs($this->reviewer)->get('/api/export?format=xlsx')->assertForbidden();

        $xlsx = $this->actingAs($this->admin)->get('/api/export?format=xlsx')->assertOk();
        $this->assertStringContainsString('inventaire_', $xlsx->headers->get('content-disposition'));
        $zip = new \ZipArchive;
        $zip->open($xlsx->getFile()->getPathname());
        $workbook = $zip->getFromName('xl/workbook.xml');
        $this->assertStringContainsString('Boîtes', $workbook);
        $this->assertStringContainsString('Documents', $workbook);

        $csv = $this->get('/api/export?format=csv&sheet=documents')->assertOk();
        $content = file_get_contents($csv->getFile()->getPathname());
        $this->assertStringContainsString('A-0001-C', $content);
        $this->assertStringContainsString('Arrêté n° 1', $content);
        $this->assertTrue(AuditLog::where('action', 'export')->exists());
    }

    public function test_device_pin_generation_is_admin_only_and_audited(): void
    {
        $device = Device::create(['letter' => 'K', 'label' => 'Tel K']);
        $this->actingAs($this->reviewer)->postJson("/api/devices/{$device->id}/pin")->assertForbidden();

        $pin = $this->actingAs($this->admin)->postJson("/api/devices/{$device->id}/pin")->assertOk()->json('pin');
        $this->assertMatchesRegularExpression('/^\d{6}$/', $pin);
        $this->assertNotSame($pin, $device->fresh()->getRawOriginal('admin_pin'), 'stored encrypted');
        $this->getJson("/api/devices/{$device->id}/pin")->assertJsonPath('pin', $pin);
        $this->getJson('/api/devices')->assertJsonPath('data.0.has_pin', true)->assertJsonMissingPath('data.0.admin_pin');
        $this->assertSame(2, AuditLog::whereIn('action', ['pin_generated', 'pin_revealed'])->count());
    }

    public function test_dashboard_stats(): void
    {
        $box = $this->box();
        $box->images()->update(['taken_at' => now()]);

        $this->actingAs($this->reviewer)->getJson('/api/dashboard')
            ->assertOk()
            ->assertJsonPath('photos_per_agent_per_day.Amina.'.now()->format('Y-m-d'), 3)
            ->assertJsonPath('backup.reminder', true)
            ->assertJsonCount(14, 'days');
    }
}
