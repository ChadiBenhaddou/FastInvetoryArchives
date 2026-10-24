<?php

namespace App\Support;

/**
 * Search copy of Arabic text: the same word written with or without hamza, final ة/ه, ى/ي,
 * tatweel, diacritics or Arabic-Indic digits must match. Applied to the indexed copy AND to the
 * query (SearchController), so both sides are compared in the same form. The stored OCR text
 * itself is never changed. French text passes through unchanged.
 */
final class ArabicText
{
    private const MAP = [
        'أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ٱ' => 'ا',
        'ى' => 'ي', 'ة' => 'ه', 'ـ' => '',
        '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
    ];

    // Harakat and tanwin (064B-065F), superscript alef (0670), Quranic annotation marks (06D6-06ED).
    private const DIACRITICS = '/[\x{064B}-\x{065F}\x{0670}\x{06D6}-\x{06ED}]/u';

    public static function forSearch(?string $text): string
    {
        return preg_replace(self::DIACRITICS, '', strtr((string) $text, self::MAP));
    }
}
