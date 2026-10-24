<?php

namespace Tests\Unit;

use App\Services\Extraction\RuleExtractor;
use PHPUnit\Framework\TestCase;

class RuleExtractorTest extends TestCase
{
    private function extract(string $text): array
    {
        return (new RuleExtractor)->extract($text)['fields'];
    }

    public function test_french_arrete(): void
    {
        $f = $this->extract("ROYAUME DU MAROC\nMinistère de l'Intérieur\nArrêté n° 145 du 12 mars 2019\nportant nomination de M. Ahmed Benali\nau poste de chef de service.");

        $this->assertSame('arrêté', $f['doc_type']);
        $this->assertSame('Arrêté n° 145 du 12 mars 2019', $f['title']);
        $this->assertSame('145', $f['reference_number']);
        $this->assertSame('2019-03-12', $f['doc_date']->format('Y-m-d'));
        $this->assertSame(['Ahmed Benali'], $f['persons']);
        $this->assertSame(['ROYAUME DU MAROC', "Ministère de l'Intérieur"], $f['organizations']);
        $this->assertSame([], $f['keywords']);
        $this->assertNull($f['summary']);
        $this->assertNull($f['extraction_confidence']);
    }

    public function test_arabic_decision_with_reference_date_and_person(): void
    {
        $f = $this->extract("المملكة المغربية\nوزارة الداخلية\nقرار رقم 2019/145 بتاريخ 5 أبريل 2019\nبشأن تعيين السيد محمد بنعلي رئيسا للمصلحة");

        $this->assertSame('arrêté', $f['doc_type']);
        $this->assertSame('قرار رقم 2019/145 بتاريخ 5 أبريل 2019', $f['title']);
        $this->assertSame('2019/145', $f['reference_number']);
        $this->assertSame('2019-04-05', $f['doc_date']->format('Y-m-d'));
        $this->assertSame(['محمد بنعلي'], $f['persons']);
        $this->assertSame(['المملكة المغربية', 'وزارة الداخلية'], $f['organizations']);
    }

    public function test_arabic_indic_digits_and_moroccan_wording(): void
    {
        $f = $this->extract("مذكرة عدد ١٢/٢٠٢٠ بتاريخ ٠٣/٠٢/٢٠٢٠\nإلى السادة رؤساء المصالح");

        $this->assertSame('note de service', $f['doc_type']);
        $this->assertSame('12/2020', $f['reference_number']);
        $this->assertSame('2020-02-03', $f['doc_date']->format('Y-m-d'));
    }

    public function test_type_with_arabic_prefix_and_letters_in_reference(): void
    {
        $f = $this->extract("محضر الاجتماع\nملف رقم 77/B");

        $this->assertSame('procès-verbal', $f['doc_type']);
        $this->assertSame('77/B', $f['reference_number']);
    }

    public function test_dates_iso_textual_and_invalid(): void
    {
        $this->assertSame('2019-03-12', $this->extract('Rabat, le 2019-03-12')['doc_date']->format('Y-m-d'));
        $this->assertSame('2021-08-01', $this->extract('Fait le 1er août 2021')['doc_date']->format('Y-m-d'));
        $this->assertSame('2018-10-20', $this->extract('حرر في 20 أكتوبر 2018')['doc_date']->format('Y-m-d'));
        // 31/02 does not exist, 1850 is out of range: the next valid date is taken.
        $this->assertSame('2020-01-15', $this->extract('31/02/2019 ou 01/01/1850, puis 15/01/2020')['doc_date']->format('Y-m-d'));
    }

    public function test_type_only_in_the_title_area(): void
    {
        $lines = array_fill(0, 8, 'Texte courant du document');
        $lines[] = 'Le rapport annuel sera transmis.';

        $this->assertNull($this->extract(implode("\n", $lines))['doc_type']);
    }

    public function test_nothing_found_stays_empty(): void
    {
        $f = $this->extract("سلسلة ديما ديما\nBAC\n221");

        $this->assertNull($f['doc_type']);
        $this->assertNull($f['doc_date']);
        $this->assertNull($f['reference_number']);
        $this->assertSame([], $f['persons']);
        $this->assertSame('سلسلة ديما ديما', $f['title']);
    }

    public function test_found_fields_and_timing(): void
    {
        $result = (new RuleExtractor)->extract("Arrêté n° 145 du 12 mars 2019");

        $this->assertEqualsCanonicalizing(['doc_type', 'title', 'doc_date', 'reference_number'], $result['found']);
        $this->assertLessThan(100, $result['duration_ms']);
    }
}
