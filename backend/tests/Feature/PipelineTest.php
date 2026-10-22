<?php

namespace Tests\Feature;

use App\Enums\BoxStatus;
use App\Enums\ImageType;
use App\Enums\OcrStatus;
use App\Events\BoxImported;
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

class PipelineTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('archive');
        config(['archive.ocr.url' => 'http://ocr.test']);
    }

    /** A box with its code photo + $documents document photos, files on the fake disk. */
    private function box(int $documents = 2, string $code = 'A-0001-C'): Box
    {
        $device = Device::firstOrCreate(['letter' => 'A'], ['label' => 'Test']);
        $box = Box::create(['code' => $code, 'device_id' => $device->id, 'sequence' => (int) substr($code, 2, 4), 'photo_count' => $documents + 1]);
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
            'text' => "وزارة الداخلية\nArrêté n° 145", 'language' => 'mixed', 'confidence' => 0.93,
            'is_handwritten' => false, 'handwriting_score' => 0.1, 'engine' => 'paddle', 'rotation' => 0, 'skew' => 0.5,
            'width' => 2000, 'height' => 1500, 'duration_ms' => 900,
            'blocks' => [['text' => 'وزارة الداخلية', 'bbox' => [10, 10, 400, 60], 'confidence' => 0.95, 'script' => 'ar']],
        ], $overrides);
    }

    private function ocrReturns(array $overrides = []): void
    {
        Http::fake(['ocr.test/ocr' => Http::response($this->ocrResult($overrides))]);
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

    public function test_ocr_results_are_stored_and_the_box_goes_to_review(): void
    {
        $this->ocrReturns();
        $box = $this->box(documents: 2);

        BoxImported::dispatch($box->id); // sync queue in tests: OCR runs right away

        $this->assertSame(BoxStatus::Review, $box->fresh()->status);
        $this->assertSame(2, Document::count());
        $doc = Document::firstOrFail();
        $this->assertSame("وزارة الداخلية\nArrêté n° 145", $doc->ocr_text);
        $this->assertSame('mixed', $doc->language);
        $this->assertSame(0.93, $doc->ocr_confidence);
        $this->assertSame('paddle', $doc->ocr_engine);
        $this->assertSame(0.5, $doc->ocr_blocks['skew']);
        $this->assertCount(1, $doc->ocr_blocks['blocks']);
        $this->assertFalse($doc->needs_review);
        $this->assertSame(OcrStatus::Done, $doc->image->ocr_status);
        $this->assertSame(2, ProcessingLog::where(['step' => 'ocr', 'status' => 'success'])->count());

        Http::assertSent(fn ($request) => $request->url() === 'http://ocr.test/ocr' && $request->isMultipart());
    }

    public function test_low_confidence_handwriting_and_empty_pages_need_review(): void
    {
        $box = $this->box(documents: 1);
        $image = $box->images()->where('type', ImageType::Document)->first();

        Http::fake(['ocr.test/ocr' => Http::sequence()
            ->push($this->ocrResult(['confidence' => 0.42]))
            ->push($this->ocrResult(['is_handwritten' => true]))
            ->push($this->ocrResult(['text' => '', 'language' => null, 'blocks' => [], 'confidence' => 0]))]);

        RunOcrJob::dispatchSync($image->id, force: true);
        $this->assertSame(['low_ocr_confidence'], Document::first()->review_reasons);

        RunOcrJob::dispatchSync($image->id, force: true);
        $this->assertSame(['handwritten'], Document::first()->review_reasons);

        RunOcrJob::dispatchSync($image->id, force: true);
        $doc = Document::first();
        $this->assertSame(['no_text'], $doc->review_reasons);
        $this->assertTrue($doc->needs_review);
        $this->assertSame(1, Document::count(), 're-running updates the same document');
    }

    public function test_an_image_whose_ocr_keeps_failing_is_flagged_and_does_not_block_its_box(): void
    {
        Http::fake(['ocr.test/ocr' => Http::response('boom', 500)]);
        $box = $this->box(documents: 1);
        $image = $box->images()->where('type', ImageType::Document)->first();
        $box->update(['status' => BoxStatus::Processing]);

        $job = new RunOcrJob($image->id);
        try {
            $job->handle(app(\App\Services\Ocr\OcrClient::class), app(\App\Services\Pipeline::class));
            $this->fail('should throw so the queue retries');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('500', $e->getMessage());
        }
        $job->failed($e); // what the queue calls after the last attempt

        $this->assertSame(OcrStatus::Failed, $image->fresh()->ocr_status);
        $doc = Document::where('image_id', $image->id)->firstOrFail();
        $this->assertTrue($doc->needs_review);
        $this->assertSame(['ocr_failed'], $doc->review_reasons);
        $this->assertSame(BoxStatus::Review, $box->fresh()->status);
        $this->assertTrue(ProcessingLog::where(['image_id' => $image->id, 'status' => 'failed'])->exists());
    }

    public function test_done_images_are_skipped_unless_forced(): void
    {
        $this->ocrReturns();
        $box = $this->box(documents: 1);
        $image = $box->images()->where('type', ImageType::Document)->first();
        $image->update(['ocr_status' => OcrStatus::Done]);

        RunOcrJob::dispatchSync($image->id);
        Http::assertNothingSent();

        RunOcrJob::dispatchSync($image->id, force: true);
        Http::assertSentCount(1);
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
    }

    public function test_pipeline_status_gives_queue_progress_and_time_estimate(): void
    {
        config(['archive.pipeline.workers' => 2]);
        $box = $this->box(documents: 4);
        $done = $box->images()->where('type', ImageType::Document)->limit(2)->pluck('id');
        Image::whereIn('id', $done)->update(['ocr_status' => OcrStatus::Done]);
        foreach ($done as $id) {
            ProcessingLog::record($id, 'ocr', 'success', null, 3000);
        }

        $this->actingAs(User::factory()->create())
            ->getJson('/api/pipeline/status')
            ->assertOk()
            ->assertJsonPath('images.pending', 2)
            ->assertJsonPath('images.done', 2)
            ->assertJsonPath('avg_ocr_ms', 3000)
            ->assertJsonPath('eta_seconds', 3); // 2 images / 2 workers × 3 s
    }
}
