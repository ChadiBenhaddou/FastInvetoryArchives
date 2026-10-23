<?php

namespace App\Services\Extraction;

use Normalizer;

/**
 * Loose text comparison for Arabic + French OCR text: used to check that a value
 * returned by the LLM really appears in the document ("never invent values").
 */
class TextMatcher
{
    private string $text;
    private string $compact;
    /** @var array<string, true> */
    private array $tokens;

    public function __construct(string $ocrText)
    {
        $this->text = self::normalize($ocrText);
        $this->compact = self::compact($ocrText);
        $this->tokens = array_fill_keys(self::tokens($this->text), true);
    }

    /** Lowercase, no accents / tashkeel, unified Arabic letter variants, Western digits. */
    public static function normalize(string $s): string
    {
        $s = strtr($s, [
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            'أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ٱ' => 'ا', 'ة' => 'ه', 'ى' => 'ي', 'ؤ' => 'و', 'ئ' => 'ي', 'ـ' => '',
        ]);
        $s = Normalizer::normalize($s, Normalizer::FORM_D) ?: $s;
        $s = preg_replace('/[\x{0300}-\x{036F}\x{064B}-\x{065F}\x{0670}]/u', '', $s); // accents, tashkeel
        $s = mb_strtolower($s);

        return trim(preg_replace('/[^\p{L}\p{N}]+/u', ' ', $s));
    }

    /** Letters and digits only, for reference numbers ("2019/145" ~ "2019 145"). */
    public static function compact(string $s): string
    {
        return str_replace(' ', '', self::normalize($s));
    }

    private static function tokens(string $normalized): array
    {
        return array_values(array_filter(explode(' ', $normalized), fn ($t) => mb_strlen($t) >= 2));
    }

    public function containsCompact(string $value): bool
    {
        $v = self::compact($value);

        return $v !== '' && str_contains($this->compact, $v);
    }

    /** True when the phrase, or most of its words, appear in the text (tolerates OCR slips). */
    public function containsPhrase(string $value): bool
    {
        $v = self::normalize($value);
        if ($v === '') {
            return false;
        }
        if (str_contains($this->text, $v)) {
            return true;
        }
        $words = self::tokens($v);
        if (! $words) {
            return false;
        }
        $found = count(array_filter($words, fn ($w) => isset($this->tokens[$w])));

        return $found / count($words) >= 0.6;
    }

    public function containsYear(string $year): bool
    {
        return (bool) preg_match('/(?<!\d)'.preg_quote($year, '/').'(?!\d)/', $this->text);
    }
}
