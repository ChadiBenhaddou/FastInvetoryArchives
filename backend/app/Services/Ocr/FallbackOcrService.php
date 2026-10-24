<?php

namespace App\Services\Ocr;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The preferred engine (Windows Snipping Tool OCR), with PaddleOCR when it cannot answer:
 * not installed (Ubuntu PC), stopped, or unable to read one photo. When the preferred service
 * is down it is left alone for a minute, instead of being retried for every photo.
 */
class FallbackOcrService implements OcrService
{
    public const PAUSE_KEY = 'ocr.preferred-engine-down';
    private const PAUSE_SECONDS = 60;

    public function __construct(private OcrService $preferred, private OcrService $fallback) {}

    public function recognize(string $imagePath): array
    {
        if (! Cache::has(self::PAUSE_KEY)) {
            try {
                return $this->preferred->recognize($imagePath);
            } catch (Throwable $e) {
                // Service down (connection refused, gateway 502…) vs this photo only (422).
                if ($e instanceof ConnectionException || ($e instanceof RequestException && $e->response->serverError())) {
                    Cache::put(self::PAUSE_KEY, true, self::PAUSE_SECONDS);
                }
                Log::warning("OCR {$this->preferred->name()} indisponible, {$this->fallback->name()} utilisé : ".mb_substr($e->getMessage(), 0, 300));
            }
        }

        return $this->fallback->recognize($imagePath);
    }

    public function healthy(): bool
    {
        return $this->preferred->healthy() || $this->fallback->healthy();
    }

    /** The engine that reads the photos right now. */
    public function name(): string
    {
        return $this->preferred->healthy() ? $this->preferred->name() : $this->fallback->name();
    }

    public function preferred(): OcrService
    {
        return $this->preferred;
    }
}
