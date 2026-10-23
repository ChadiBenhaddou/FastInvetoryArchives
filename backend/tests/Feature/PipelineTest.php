<?php

namespace Tests\Feature;

use App\Enums\BoxStatus;
use App\Enums\ImageType;
use App\Enums\OcrStatus;
use App\Events\BoxImported;
use App\Jobs\ExtractMetadataJob;
use App\Jobs\IndexDocumentJob;
use App\Jobs\RunOcrJob;
use App\Models\Box;
use App\Models\Device;
use App\Models\Document;
use App\Models\Image;
use App\Models\ProcessingLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Import → OCR → LLM extraction → search indexing → box "to review". All services faked over HTTP. */
class PipelineTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('archive');
        config([
            'archive.ocr.url' => 'http://ocr.test',
            'archive.llm.url' => 'http://llm.test',
            'archive.meilisearch.host' => 'http://search.test',
        ]);
    }

    /** A box with its code photo + $documents document photos, files on the fake disk. */
    private function box(int $documents = 2, string $code = 'A-0001-C'): Box
    {
        $device = Device::firstOrCreate(['letter' => 'A'], ['label' => 'Test']);
        $box = Box::create(['code' => $code, 'device_id' => $device->id, 'sequence' => (int) substr($code, 2, 4), 'photo_count' => $documents + 1, 'room' => 'Salle 1']);
        for ($i = 0; $i <= $documents; $i++) {
            $path = sprintf('%s/%03d.jpg', $code, $i);
            Storage::disk('archive')->put($path, 'jpeg-bytes');
            Image::create([
                'box_id' => $box->id, 'sequence' => $i, 'path' => $path, 'checksum' => str_repeat('a', 64),
                'type' => $i === 0 ? ImageType::CodePhoto : ImageType::Document,
                'ocr_status' => $i === 0 ? OcrStatus::Skipped : OcrStatus::Pending,
            ]);
        }

        return $box;
    }

    private function ocrResult(array $overrides = []): array
    {
        return array_merge([
            'text' => "وزارة الداخلية\nArrêté n° 145 du 12 mars 2019", 'language' => 'mixed', 'confidence' => 0.93,
            'is_handwritten' => false, 'handwriting_score' => 0.1, 'engine' => 'paddle', 'rotation' => 0, 'skew' => 0.5,
            'width' => 2000, 'height' => 1500, 'duration_ms' => 900,
            'blocks' => [['text' => 'وزارة الداخلية', 'bbox' => [10, 10, 400, 60], 'confidence' => 0.95, 'script' => 'ar']],
        ], $overrides);
    }

    private function llmAnswer(array $overrides = []): array
    {
        return ['message' => ['content' => json_encode(array_merge([
            'doc_type' => 'arrêté', 'title' => 'Arrêté n° 145', 'doc_date' => '2019-03-12', 'reference_number' => '145',
            'persons' => [], 'organizations' => ['وزارة الداخلية'], 'keywords' => ['arrêté'],
            'summary' => 'Arrêté du ministère.', 'language' => 'mixed', 'confidence' => 0.85,
        ], $overrides), JSON_UNESCAPED_UNICODE)]];
    }

    private function fakeServices(array $ocr = [], array $llm = [], int $searchStatus = 202): void
    {
        Http::fake([
            'ocr.test/*' => Http::response($this->ocrResult($ocr)),
            'llm.test/*' => Http::response($this->llmAnswer($llm)),
            'search.test/*' => Http::response(['taskUid' => 1], $searchStatus),
        ]);
    }

    public function test_imported_box_is_queued_for_ocr_except_its_code_photo(): void
    {
        Queue::fake();
        $box = $this->box(documents: 2);

        BoxImported::dispatch($box->id);

        Queue::assertPushedOn('ocr', RunOcrJob::class);
        Queue::assertPushed(RunOcrJob::class, 2);
        $codePhotoId = $box->images()->where('sequence', 0)->value('id');
        Queue::assertNotPushed(RunOcrJob::class, fn ($job) => $job->imageId === $codePhotoId);
        $this->assertSame(BoxStatus::Processing, $box->fresh()->status);
    }

    public function test_full_chain_ocr_extraction_indexing_then_review(): void
    {
        $this->fakeServices();
        $box = $this->box(documents: 2);

        BoxImported::dispatch($box->id); // sync queue in tests: every step runs right away

        $this->assertSame(BoxStatus::Review, $box->fresh()->status);
        $this->assertSame(2, Document::count());
        $doc = Document::firstOrFail();
        // OCR
        $this->assertSame("وزارة الداخلية\nArrêté n° 145 du 12 mars 2019", $doc->ocr_text);
        $this->assertSame('mixed', $doc->language);
        $this->assertSame(0.5, $doc->ocr_blocks['skew']);
        // Extraction
        $this->assertSame('done', $doc->extraction_status);
        $this->assertSame('arrêté', $doc->doc_type);
        $this->assertSame('2019-03-12', $doc->doc_date->format('Y-m-d'));
        $this->assertSame('145', $doc->reference_number);
        $this->assertSame(0.85, $doc->extraction_confidence);
        $this->assertSame(config('archive.llm.model'), $doc->extraction_model);
        $this->assertFalse($doc->needs_review);
        // Indexing
        $this->assertSame('done', $doc->index_status);
        $this->assertNotNull($doc->indexed_at);
        Http::assertSent(function ($request) use ($box) {
            if (! str_contains($request->url(), 'search.test/indexes/documents/documents')) {
                return false;
            }
            $sent = $request->data()[0];

            return $sent['box_code'] === 'A-0001-C' && $sent['year'] === 2019 && $sent['room'] === 'Salle 1'
                && $sent['doc_type'] === 'arrêté' && str_contains($sent['ocr_text'], 'وزارة');
        });
        $this->assertSame(2, ProcessingLog::where(['step' => 'ocr', 'status' => 'success'])->count());
        $this->assertSame(2, ProcessingLog::where(['step' => 'extract', 'status' => 'success'])->count());
        // Indexed twice per document: right after OCR, then with the extracted fields.
        $this->assertSame(4, ProcessingLog::where(['step' => 'index', 'status' => 'success'])->count());
    }

    public function test_text_is_searchable_before_the_slow_llm_extraction(): void
    {
        $this->fakeServices();
        Queue::fake([ExtractMetadataJob::class]);
        $box = $this->box(documents: 1);

        BoxImported::dispatch($box->id);

        Queue::assertPushedOn('extract', ExtractMetadataJob::class);
        $doc = Document::first();
        $this->assertSame('pending', $doc->extraction_status);
        $this->assertSame('done', $doc->index_status);
        Http::assertSent(fn ($r) => str_contains($r->url(), 'search.test/indexes/documents/documents')
            && str_contains($r->data()[0]['ocr_text'], 'وزارة'));
        // ...but the box waits for the extraction before going to review.
        $this->assertSame(BoxStatus::Processing, $box->fresh()->status);
    }

    public function test_low_extraction_confidence_needs_review(): void
    {
        $this->fakeServices(llm: ['confidence' => 0.4]);
        $box = $this->box(documents: 1);

        BoxImported::dispatch($box->id);

        $doc = Document::firstOrFail();
        $this->assertTrue($doc->needs_review);
        $this->assertSame(['low_extraction_confidence'], $doc->review_reasons);
        $this->assertSame(BoxStatus::Review, $box->fresh()->status);
    }

    public function test_invalid_llm_answers_flag_the_document_but_finish_the_box(): void
    {
        Http::fake([
            'ocr.test/*' => Http::response($this->ocrResult()),
            'llm.test/*' => Http::response(['message' => ['content' => 'pas du JSON']]),
            'search.test/*' => Http::response(['taskUid' => 1], 202),
        ]);
        $box = $this->box(documents: 1);

        BoxImported::dispatch($box->id);

        $doc = Document::firstOrFail();
        $this->assertSame('failed', $doc->extraction_status);
        $this->assertSame(['extraction_failed'], $doc->review_reasons);
        $this->assertSame('done', $doc->index_status, 'still searchable by its OCR text');
        $this->assertSame(BoxStatus::Review, $box->fresh()->status);
    }

    public function test_pages_without_text_skip_extraction(): void
    {
        $this->fakeServices(ocr: ['text' => '', 'language' => null, 'blocks' => [], 'confidence' => 0]);
        $box = $this->box(documents: 1);

        BoxImported::dispatch($box->id);

        $doc = Document::firstOrFail();
        $this->assertSame('skipped', $doc->extraction_status);
        $this->assertSame(['no_text'], $doc->review_reasons);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'llm.test'));
        $this->assertSame(BoxStatus::Review, $box->fresh()->status);
    }

    public function test_low_ocr_confidence_and_handwriting_need_review(): void
    {
        Queue::fake([ExtractMetadataJob::class, IndexDocumentJob::class]);
        $box = $this->box(documents: 1);
        $image = $box->images()->where('type', ImageType::Document)->first();

        Http::fake(['ocr.test/*' => Http::sequence()
            ->push($this->ocrResult(['confidence' => 0.42]))
            ->push($this->ocrResult(['is_handwritten' => true]))]);

        RunOcrJob::dispatchSync($image->id, force: true);
        $this->assertSame(['low_ocr_confidence'], Document::first()->review_reasons);

        RunOcrJob::dispatchSync($image->id, force: true);
        $this->assertSame(['handwritten'], Document::first()->review_reasons);
        $this->assertSame(1, Document::count(), 're-running updates the same document');
    }

    public function test_an_image_whose_ocr_keeps_failing_is_flagged_and_does_not_block_its_box(): void
    {
        Http::fake(['ocr.test/*' => Http::response('boom', 500), 'search.test/*' => Http::response(['taskUid' => 1], 202)]);
        $box = $this->box(documents: 1);
        $image = $box->images()->where('type', ImageType::Document)->first();
        $box->update(['status' => BoxStatus::Processing]);

        $job = new RunOcrJob($image->id);
        try {
            app()->call([$job, 'handle']);
            $this->fail('should throw so the queue retries');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('500', $e->getMessage());
        }
        $job->failed($e); // what the queue calls after the last attempt

        $this->assertSame(OcrStatus::Failed, $image->fresh()->ocr_status);
        $doc = Document::where('image_id', $image->id)->firstOrFail();
        $this->assertTrue($doc->needs_review);
        $this->assertSame(['ocr_failed'], $doc->review_reasons);
        $this->assertSame('skipped', $doc->extraction_status);
        $this->assertSame(BoxStatus::Review, $box->fresh()->status);
    }

    public function test_search_engine_outage_does_not_block_the_box(): void
    {
        $this->fakeServices(searchStatus: 503);
        $box = $this->box(documents: 1);
        $box->update(['status' => BoxStatus::Processing]);
        $image = $box->images()->where('type', ImageType::Document)->first();
        Queue::fake([IndexDocumentJob::class]);
        RunOcrJob::dispatchSync($image->id);
        $doc = Document::firstOrFail();

        $job = new IndexDocumentJob($doc->id);
        try {
            app()->call([$job, 'handle']);
        } catch (\Throwable $e) {
            $job->failed($e);
        }

        $this->assertSame('failed', $doc->fresh()->index_status);
        $this->assertSame(BoxStatus::Review, $box->fresh()->status);
    }

    public function test_done_images_are_skipped_unless_forced(): void
    {
        $this->fakeServices();
        $box = $this->box(documents: 1);
        $image = $box->images()->where('type', ImageType::Document)->first();
        $image->update(['ocr_status' => OcrStatus::Done]);

        RunOcrJob::dispatchSync($image->id);
        Http::assertNothingSent();

        RunOcrJob::dispatchSync($image->id, force: true);
        Http::assertSent(fn ($r) => str_contains($r->url(), 'ocr.test'));
    }

    public function test_reprocess_command(): void
    {
        Queue::fake();
        $box = $this->box(documents: 2);
        $box->images()->where('type', ImageType::Document)->update(['ocr_status' => OcrStatus::Failed]);

        Artisan::call('archive:reprocess', ['--failed' => true]);

        Queue::assertPushed(RunOcrJob::class, fn ($job) => $job->force);
        Queue::assertPushed(RunOcrJob::class, 2);
        $this->assertSame(0, Image::where('ocr_status', OcrStatus::Failed)->count());

        Document::create(['box_id' => $box->id, 'image_id' => $box->images()->where('sequence', 1)->value('id'), 'ocr_text' => 'x', 'extraction_status' => 'done']);
        Artisan::call('archive:reprocess', ['codes' => ['A-0001-C'], '--extraction' => true]);
        Queue::assertPushed(ExtractMetadataJob::class, 1);
    }

    public function test_pipeline_status_gives_queue_progress_and_time_estimate(): void
    {
        config(['archive.pipeline.workers' => 2, 'archive.pipeline.extract_workers' => 1]);
        $box = $this->box(documents: 4);
        $done = $box->images()->where('type', ImageType::Document)->limit(2)->pluck('id');
        Image::whereIn('id', $done)->update(['ocr_status' => OcrStatus::Done]);
        foreach ($done as $id) {
            ProcessingLog::record($id, 'ocr', 'success', null, 3000);
            ProcessingLog::record($id, 'extract', 'success', null, 20000);
        }

        $this->actingAs(User::factory()->create())
            ->getJson('/api/pipeline/status')
            ->assertOk()
            ->assertJsonPath('images.pending', 2)
            ->assertJsonPath('images.done', 2)
            ->assertJsonPath('avg_ocr_ms', 3000)
            ->assertJsonPath('avg_extract_ms', 20000)
            // OCR: 2 photos / 2 workers × 3 s = 3 s; extraction: 2 × 20 s = 40 s → the slowest step
            ->assertJsonPath('eta_seconds', 40);
    }
}
