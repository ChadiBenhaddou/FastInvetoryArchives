<?php

namespace App\Services\Ocr;

use Illuminate\Support\Facades\Http;

/**
 * Windows 11 Snipping Tool OCR (oneocr), much better than PaddleOCR on Arabic phone photos.
 * The engine is a Windows DLL, so it runs as a small service on the PC itself (windows-ocr/,
 * 127.0.0.1 only); the containers reach it through the gateway, which forwards its port 8010.
 */
class WindowsOneOcrEngine implements OcrService
{
    public const NAME = 'windows-oneocr';

    /** @throws \Illuminate\Http\Client\ConnectionException|\Illuminate\Http\Client\RequestException */
    public function recognize(string $imagePath): array
    {
        return Http::timeout(config('archive.ocr.windows.timeout'))
            ->withBody(file_get_contents($imagePath), 'application/octet-stream')
            ->post($this->url('/ocr'))
            ->throw()
            ->json();
    }

    public function healthy(): bool
    {
        try {
            return Http::timeout(3)->get($this->url('/health'))->json('status') === 'ok';
        } catch (\Throwable) {
            return false;
        }
    }

    public function name(): string
    {
        return self::NAME;
    }

    private function url(string $path): string
    {
        return rtrim(config('archive.ocr.windows.url'), '/').$path;
    }
}
