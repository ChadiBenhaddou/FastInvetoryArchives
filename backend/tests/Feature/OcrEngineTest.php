<?php

namespace Tests\Feature;

use App\Enums\ImageType;
use App\Enums\OcrStatus;
use App\Jobs\RunOcrJob;
use App\Models\Box;
use App\Models\Device;
use App\Models\Document;
use App\Models\Image;
use App\Services\Ocr\FallbackOcrService;
use App\Services\Ocr\OcrService;
use App\Services\Ocr\PaddleOcrEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** OCR_ENGINE=windows: Snipping Tool OCR through the gateway, PaddleOCR when it cannot answer. */
class OcrEngineTest extends TestCase
{
    use RefreshDatabase;

    private string $photo;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('archive');
        Storage::disk('archive')->put('A-0001-C/001.jpg', 'jpeg-bytes');
        $this->photo = Storage::disk('archive')->path('A-0001-C/001.jpg');
        config([
            'archive.ocr.engine' => 'windows',
            'archive.ocr.url' => 'http://paddle.test',
            'archive.ocr.windows.url' => 'http://gateway.test:8010',
        ]);
    }

    private static function ocrResult(string $engine, string $text = 'مديرية الأرشيف'): array
    {
        return ['text' => $text, 'language' => 'ar', 'confidence' => 0.9, 'is_handwritten' => false, 'handwriting_score' => 0.1,
            'blocks' => [['text' => $text, 'bbox' => [1, 2, 3, 4], 'confidence' => 0.9, 'script' => 'ar']],
            'engine' => $engine, 'rotation' => 0, 'skew' => 0.0, 'width' => 1500, 'height' => 2000, 'duration_ms' => 800];
    }

    public function test_configured_engine(): void
    {
        $this->assertInstanceOf(FallbackOcrService::class, app(OcrService::class));
        config(['archive.ocr.engine' => 'paddle']);
        $this->assertInstanceOf(PaddleOcrEngine::class, app(OcrService::class));
    }

    public function test_windows_engine_receives_the_photo_bytes_through_the_gateway(): void
    {
        Http::fake(['gateway.test:8010/ocr' => Http::response(self::ocrResult('windows-oneocr'))]);

        $result = app(OcrService::class)->recognize($this->photo);

        $this->assertSame('windows-oneocr', $result['engine']);
        Http::assertSent(fn ($r) => $r->url() === 'http://gateway.test:8010/ocr' && $r->body() === 'jpeg-bytes');
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'paddle.test'));
    }

    public function test_service_down_falls_back_to_paddle_and_is_left_alone_for_a_minute(): void
    {
        Http::fake([
            'gateway.test:8010/*' => fn () => throw new ConnectionException('Connection refused'),
            'paddle.test/ocr' => Http::response(self::ocrResult('paddle')),
        ]);
        $ocr = app(OcrService::class);

        $this->assertSame('paddle', $ocr->recognize($this->photo)['engine']);
        $this->assertTrue(Cache::has(FallbackOcrService::PAUSE_KEY));
        $this->assertSame('paddle', $ocr->recognize($this->photo)['engine']);
        // Not retried during the pause: only the first photo tried the Windows engine.
        $this->assertSame(2, Http::recorded(fn ($r) => str_contains($r->url(), 'paddle.test'))->count());
        $this->assertLessThanOrEqual(1, Http::recorded(fn ($r) => str_contains($r->url(), 'gateway.test'))->count());

        $this->travel(61)->seconds();
        $this->assertFalse(Cache::has(FallbackOcrService::PAUSE_KEY));
    }

    public function test_gateway_error_when_the_windows_service_is_stopped_counts_as_down(): void
    {
        Http::fake([
            'gateway.test:8010/*' => Http::response('<html>502 Bad Gateway</html>', 502),
            'paddle.test/ocr' => Http::response(self::ocrResult('paddle')),
        ]);

        $this->assertSame('paddle', app(OcrService::class)->recognize($this->photo)['engine']);
        $this->assertTrue(Cache::has(FallbackOcrService::PAUSE_KEY));
    }

    public function test_a_photo_the_windows_engine_refuses_goes_to_paddle_without_pausing_it(): void
    {
        Http::fake([
            'gateway.test:8010/*' => Http::response(['detail' => 'Unsupported image size'], 422),
            'paddle.test/ocr' => Http::response(self::ocrResult('paddle')),
        ]);

        $this->assertSame('paddle', app(OcrService::class)->recognize($this->photo)['engine']);
        $this->assertFalse(Cache::has(FallbackOcrService::PAUSE_KEY));
    }

    public function test_name_is_the_engine_reading_the_photos_now(): void
    {
        Http::fake([
            'gateway.test:8010/health' => Http::sequence()->push(['status' => 'ok'])->push('', 502),
            'paddle.test/health' => Http::response(['status' => 'ok']),
        ]);
        $ocr = app(OcrService::class);

        $this->assertSame('windows-oneocr', $ocr->name());
        $this->assertSame('paddle', $ocr->name());
        $this->assertTrue($ocr->healthy());
    }

    public function test_the_job_stores_the_engine_and_its_text(): void
    {
        Http::fake(['gateway.test:8010/ocr' => Http::response(self::ocrResult('windows-oneocr', "قرار رقم 145\nمديرية الأرشيف"))]);
        Queue::fake(); // only the OCR step here
        $image = $this->image();

        (new RunOcrJob($image->id))->handle(app(OcrService::class), app(\App\Services\Pipeline::class));

        $doc = Document::where('image_id', $image->id)->firstOrFail();
        $this->assertSame('windows-oneocr', $doc->ocr_engine);
        $this->assertSame("قرار رقم 145\nمديرية الأرشيف", $doc->ocr_text);
        $this->assertSame([1, 2, 3, 4], $doc->ocr_blocks['blocks'][0]['bbox']);
        $this->assertSame(OcrStatus::Done, $image->fresh()->ocr_status);
    }

    public function test_reprocess_upgrade_skips_photos_already_read_by_the_windows_engine(): void
    {
        Queue::fake();
        $paddle = $this->image(1);
        $windows = $this->image(2);
        $never = $this->image(3);
        Document::create(['box_id' => $paddle->box_id, 'image_id' => $paddle->id, 'ocr_text' => 'x', 'ocr_engine' => 'paddle']);
        Document::create(['box_id' => $windows->box_id, 'image_id' => $windows->id, 'ocr_text' => 'x', 'ocr_engine' => 'windows-oneocr']);

        $this->artisan('archive:reprocess --upgrade')->expectsOutputToContain('2 photo(s)')->assertSuccessful();

        Queue::assertPushed(RunOcrJob::class, 2);
        Queue::assertPushed(RunOcrJob::class, fn ($job) => $job->imageId === $paddle->id && $job->force);
        Queue::assertPushed(RunOcrJob::class, fn ($job) => $job->imageId === $never->id);
        Queue::assertNotPushed(RunOcrJob::class, fn ($job) => $job->imageId === $windows->id);
    }

    private function image(int $sequence = 1): Image
    {
        $device = Device::firstOrCreate(['letter' => 'A'], ['label' => 'Test']);
        $box = Box::firstOrCreate(['code' => 'A-0001-C'], ['device_id' => $device->id, 'sequence' => 1, 'photo_count' => 4]);

        return Image::create(['box_id' => $box->id, 'sequence' => $sequence, 'path' => 'A-0001-C/001.jpg',
            'checksum' => str_repeat('a', 64), 'type' => ImageType::Document, 'ocr_status' => OcrStatus::Pending]);
    }
}
