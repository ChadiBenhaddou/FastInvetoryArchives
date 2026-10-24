<?php

namespace Tests\Unit;

use App\Support\ArabicText;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ArabicTextTest extends TestCase
{
    public static function spellings(): iterable
    {
        yield 'hamza on alef' => ['أحمد إبراهيم آمال', 'احمد ابراهيم امال'];
        yield 'alef wasla' => ['ٱلله', 'الله'];
        yield 'alef maqsura' => ['مستشفى', 'مستشفي'];
        yield 'teh marbuta' => ['المديرية', 'المديريه'];
        yield 'tatweel' => ['الـــداخلية', 'الداخليه'];
        yield 'harakat and tanwin' => ['مَدْرَسَةٌ', 'مدرسه'];
        yield 'quranic marks' => ['الرَّحْمَٰنِ ۚ', 'الرحمن '];
        yield 'arabic-indic digits' => ['رقم ١٤٥/٢٠١٩', 'رقم 145/2019'];
        yield 'persian digits' => ['۲۰۲۴', '2024'];
        yield 'french untouched' => ['Arrêté n° 145 — Ministère', 'Arrêté n° 145 — Ministère'];
    }

    #[DataProvider('spellings')]
    public function test_search_copy(string $text, string $expected): void
    {
        $this->assertSame($expected, ArabicText::forSearch($text));
    }

    public function test_every_spelling_of_a_word_gives_the_same_search_copy(): void
    {
        $forms = ['الإمارة', 'الامارة', 'الأمارة', 'الإمَارَة', 'الامـارة', 'الاماره'];
        $this->assertCount(1, array_unique(array_map(ArabicText::forSearch(...), $forms)));
    }

    public function test_null(): void
    {
        $this->assertSame('', ArabicText::forSearch(null));
    }
}
