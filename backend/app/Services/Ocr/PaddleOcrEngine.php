<?php

namespace App\Services\Ocr;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * PaddleOCR (+ Tesseract when it finds nothing) in the ocr-worker container, internal network
 * only. Works on every platform; the fallback of the Windows engine.
 */
class PaddleOcrEngine implements OcrService
{
    public const NAME = 'paddle';

    public function recognize(string $imagePath): array
    {
        $response = Http::timeout(config('archive.ocr.timeout'))
            ->attach('image', fopen($imagePath, 'rb'), basename($imagePath))
            ->post(rtrim(config('archive.ocr.url'), '/').'/ocr');

        if ($response->failed()) {
            throw new RuntimeException("OCR worker HTTP {$response->status()}: ".mb_substr($response->body(), 0, 300));
        }

        return $response->json();
    }

    public function healthy(): bool
    {
        try {
            return Http::timeout(3)->get(rtrim(config('archive.ocr.url'), '/').'/health')->json('status') === 'ok';
        } catch (\Throwable) {
            return false;
        }
    }

    public function name(): string
    {
        return self::NAME;
    }
}
