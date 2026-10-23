<?php

namespace Tests\Feature;

use App\Services\Extraction\ExtractionFailed;
use App\Services\Extraction\LlmExtractor;
use App\Services\Extraction\TextMatcher;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ExtractionTest extends TestCase
{
    private const OCR = "ROYAUME DU MAROC\nMinistère de l'Intérieur\nArrêté n° 2019/145 du 12 mars 2019\n"
        ."Objet : nomination de M. Karim Benali\nالسيد محمد العلوي رئيس المصلحة";

    protected function setUp(): void
    {
        parent::setUp();
        config(['archive.llm.url' => 'http://llm.test', 'archive.llm.model' => 'test-model']);
    }

    private static function answer(array $overrides = []): array
    {
        return ['message' => ['content' => json_encode(array_merge([
            'doc_type' => 'Arrêté', 'title' => 'Nomination de M. Karim Benali', 'doc_date' => '2019-03-12',
            'reference_number' => '2019/145', 'persons' => ['Karim Benali', 'محمد العلوي'],
            'organizations' => ["Ministère de l'Intérieur"], 'keywords' => ['nomination', 'arrêté'],
            'summary' => "Arrêté nommant M. Karim Benali.", 'language' => 'mixed', 'confidence' => 0.9,
        ], $overrides), JSON_UNESCAPED_UNICODE)]];
    }

    public function test_extracts_fields_with_a_json_schema_constrained_request(): void
    {
        Http::fake(['llm.test/api/chat' => Http::response(self::answer())]);

        $r = app(LlmExtractor::class)->extract(self::OCR);

        $f = $r['fields'];
        $this->assertSame('arrêté', $f['doc_type']);
        $this->assertSame('2019-03-12', $f['doc_date']->format('Y-m-d'));
        $this->assertSame('2019/145', $f['reference_number']);
        $this->assertSame(['Karim Benali', 'محمد العلوي'], $f['persons']);
        $this->assertSame(0.9, $f['extraction_confidence']);
        $this->assertSame([], $r['dropped']);
        $this->assertSame(1, $r['attempts']);

        Http::assertSent(function ($request) {
            $body = $request->data();

            return $body['model'] === 'test-model'
                && $body['format'] === LlmExtractor::SCHEMA
                && $body['options']['temperature'] === 0
                && $body['messages'][0]['content'] === LlmExtractor::PROMPT
                && str_contains($body['messages'][1]['content'], 'Karim Benali');
        });
    }

    public function test_values_absent_from_the_text_are_dropped_and_lower_confidence(): void
    {
        Http::fake(['llm.test/api/chat' => Http::response(self::answer([
            'reference_number' => '2020/999',          // not in the text
            'doc_date' => '2018-01-01',                // year not in the text
            'persons' => ['Karim Benali', 'Jean Dupont'],
            'organizations' => ['Préfecture de Casablanca'],
        ]))]);

        $r = app(LlmExtractor::class)->extract(self::OCR);

        $this->assertNull($r['fields']['reference_number']);
        $this->assertNull($r['fields']['doc_date']);
        $this->assertSame(['Karim Benali'], $r['fields']['persons']);
        $this->assertSame([], $r['fields']['organizations']);
        $this->assertCount(4, $r['dropped']);
        $this->assertEqualsWithDelta(0.3, $r['fields']['extraction_confidence'], 0.001); // 0.9 - 4 × 0.15
    }

    public function test_invalid_json_is_retried_once(): void
    {
        Http::fake(['llm.test/api/chat' => Http::sequence()
            ->push(['message' => ['content' => 'Voici le JSON : {oups']])
            ->push(self::answer())]);

        $r = app(LlmExtractor::class)->extract(self::OCR);

        $this->assertSame(2, $r['attempts']);
        Http::assertSentCount(2);
    }

    public function test_two_invalid_answers_fail(): void
    {
        Http::fake(['llm.test/api/chat' => Http::response(['message' => ['content' => '[]']])]);

        $this->expectException(ExtractionFailed::class);
        app(LlmExtractor::class)->extract(self::OCR);
    }

    public function test_bad_dates_and_placeholders_are_cleaned(): void
    {
        Http::fake(['llm.test/api/chat' => Http::response(self::answer([
            'doc_date' => '2019-02-30', 'title' => 'null', 'keywords' => ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'a'],
            'confidence' => 7,
        ]))]);

        $f = app(LlmExtractor::class)->extract(self::OCR)['fields'];

        $this->assertNull($f['doc_date']);
        $this->assertNull($f['title']);
        $this->assertCount(8, $f['keywords']);
        $this->assertLessThanOrEqual(1.0, $f['extraction_confidence']);
    }

    public function test_reference_keeps_only_the_code(): void
    {
        Http::fake(['llm.test/api/chat' => Http::sequence()
            ->push(self::answer(['reference_number' => 'n° 2019/145']))
            ->push(self::answer(['reference_number' => '2019/145 — Ministère de l\'Intérieur']))
            ->push(self::answer(['reference_number' => 'Ministère']))]);
        $extractor = app(LlmExtractor::class);

        $this->assertSame('2019/145', $extractor->extract(self::OCR)['fields']['reference_number']);
        $this->assertSame('2019/145', $extractor->extract(self::OCR)['fields']['reference_number']);
        $this->assertNull($extractor->extract(self::OCR)['fields']['reference_number']);
    }

    public function test_text_matching_tolerates_arabic_variants_and_digits(): void
    {
        $m = new TextMatcher('قرار رقم ١٤٥ بتاريخ 12 مارس 2019 — السيد أحمد الإدريسي');

        $this->assertTrue($m->containsCompact('145'));
        $this->assertTrue($m->containsPhrase('احمد الادريسي'));   // hamza variants
        $this->assertTrue($m->containsYear('2019'));
        $this->assertFalse($m->containsYear('201'));
        $this->assertFalse($m->containsPhrase('محمد بنعلي'));
    }

    public function test_rambling_summary_is_cut_after_the_first_sentence(): void
    {
        $short = 'Arrêté nommant M. Karim Benali. Second sentence.';
        $this->assertSame($short, LlmExtractor::firstSentence($short));

        $long = "Le ministère nomme M. Mohamed Alawi chef de service à Rabat. 2019-03-12, 145, Mohamed Alawi, "
            .str_repeat('direction des archives, Rabat, ', 6);
        $this->assertSame('Le ministère nomme M. Mohamed Alawi chef de service à Rabat.', LlmExtractor::firstSentence($long));
        $this->assertNull(LlmExtractor::firstSentence(null));
    }
}
