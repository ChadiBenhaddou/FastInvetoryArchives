<?php

namespace App\Services\Ocr;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/** Client of the local Python OCR worker (ocr-worker container, internal network only). */
class OcrClient
{
    /**
     * @return array{text: string, language: ?string, confidence: float, is_handwritten: bool,
     *               handwriting_score: float, blocks: array, engine: string, rotation: int, skew: float,
     *               width: int, height: int, duration_ms: int}
     */
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
}
