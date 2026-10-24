<?php

namespace App\Providers;

use App\Services\Ocr\FallbackOcrService;
use App\Services\Ocr\OcrService;
use App\Services\Ocr\PaddleOcrEngine;
use App\Services\Ocr\WindowsOneOcrEngine;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Resolved on each use: OCR_ENGINE is read at that moment.
        $this->app->bind(OcrService::class, fn () => config('archive.ocr.engine') === 'windows'
            ? new FallbackOcrService(new WindowsOneOcrEngine, new PaddleOcrEngine)
            : new PaddleOcrEngine);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
