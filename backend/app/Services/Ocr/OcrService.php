<?php

namespace App\Services\Ocr;

/**
 * An OCR engine. Every engine returns the same result, stored as is by RunOcrJob: text in
 * logical order (Arabic as read, right to left), lines with their bounding box and confidence,
 * and a page confidence used to send doubtful pages to human review.
 *
 * Chosen with OCR_ENGINE (config/archive.php): "windows" = Snipping Tool OCR on the Windows PC,
 * with PaddleOCR when it is unavailable; "paddle" = PaddleOCR only.
 */
interface OcrService
{
    /**
     * @return array{text: string, language: ?string, confidence: float, is_handwritten: bool,
     *               handwriting_score: float, blocks: array, engine: string, rotation: int, skew: float,
     *               width: int, height: int, duration_ms: int}
     */
    public function recognize(string $imagePath): array;

    public function healthy(): bool;

    /** Engine name, as stored with each page (documents.ocr_engine). */
    public function name(): string;
}
