<?php

namespace App\Services\Extraction;

use App\Support\ArabicText;
use Carbon\Carbon;
use Normalizer;

/**
 * Metadata from the OCR text by fixed rules (French + Arabic), in a few milliseconds:
 * the default since the local LLM took ~2.5 min per page on the CPU (LLM_ENABLED=false).
 *
 * Everything returned is cut from the text itself (a date, a number, a whole line), so
 * nothing is ever invented; what is not found stays empty for the reviewer. Same fields
 * as LlmExtractor, without keywords and summary (an LLM's job).
 */
class RuleExtractor
{
    public const NAME = 'rules';

    /** Title area: the document type is looked for in these first lines only. */
    private const HEAD_LINES = 6;

    /** French keywords without accents, Arabic in their ArabicText::forSearch form (ة → ه…). */
    private const DOC_TYPES = [
        'arrêté' => ['arrete', 'قرار'],
        'décision' => ['decision', 'مقرر'],
        'décret' => ['decret', 'مرسوم'],
        'circulaire' => ['circulaire', 'دوريه', 'منشور'],
        'note de service' => ['note de service', 'مذكره'],
        'correspondance' => ['correspondance', 'lettre', 'رساله', 'مراسله', 'ارساليه'],
        'procès-verbal' => ['proces-verbal', 'proces verbal', 'محضر'],
        'rapport' => ['rapport', 'تقرير'],
        'demande' => ['demande', 'requete', 'طلب'],
        'attestation' => ['attestation', 'certificat', 'شهاده'],
        'contrat' => ['contrat', 'convention', 'عقد', 'اتفاقيه'],
        'facture' => ['facture', 'فاتوره'],
        'état' => ['etat des', 'etat de', 'بيان'],
        'liste' => ['liste', 'لائحه', 'قائمه'],
    ];

    private const ORGANIZATION_STARTS = [
        'royaume', 'ministere', 'direction', 'division', 'service', 'prefecture', 'province', 'commune',
        'wilaya', 'region', 'agence', 'office', 'tribunal', 'cour', 'conseil', 'delegation', 'caisse',
        'universite', 'academie', 'secretariat',
        'المملكه', 'وزاره', 'مديريه', 'المديريه', 'قسم', 'مصلحه', 'عماله', 'ولايه', 'جهه', 'جماعه', 'بلديه',
        'اقليم', 'وكاله', 'مكتب', 'محكمه', 'مجلس', 'نيابه', 'اكاديميه', 'جامعه', 'مندوبيه', 'الكتابه العامه',
    ];

    private const MONTHS = [
        // French (without accents)
        'janvier' => 1, 'fevrier' => 2, 'mars' => 3, 'avril' => 4, 'mai' => 5, 'juin' => 6, 'juillet' => 7,
        'aout' => 8, 'septembre' => 9, 'octobre' => 10, 'novembre' => 11, 'decembre' => 12,
        // Arabic, Moroccan and Middle-Eastern names (normalized: ابريل, اغسطس…)
        'يناير' => 1, 'فبراير' => 2, 'مارس' => 3, 'ابريل' => 4, 'ماي' => 5, 'مايو' => 5, 'يونيو' => 6, 'يونيه' => 6,
        'يوليوز' => 7, 'يوليو' => 7, 'غشت' => 8, 'اغسطس' => 8, 'شتنبر' => 9, 'سبتمبر' => 9, 'اكتوبر' => 10,
        'نونبر' => 11, 'نوفمبر' => 11, 'دجنبر' => 12, 'ديسمبر' => 12,
        'كانون الثاني' => 1, 'شباط' => 2, 'اذار' => 3, 'نيسان' => 4, 'ايار' => 5, 'حزيران' => 6, 'تموز' => 7,
        'اب' => 8, 'ايلول' => 9, 'تشرين الاول' => 10, 'تشرين الثاني' => 11, 'كانون الاول' => 12,
    ];

    /**
     * @return array{fields: array, found: string[], duration_ms: int}
     */
    public function extract(string $ocrText): array
    {
        $started = hrtime(true);
        $lines = array_values(array_filter(array_map('trim', preg_split('/\R/u', $ocrText)), fn ($l) => $l !== ''));
        $flat = self::flat($ocrText);

        [$docType, $typeLine] = $this->docType($lines);
        $fields = [
            'doc_type' => $docType,
            'title' => $this->title($lines, $typeLine),
            'doc_date' => $this->date($flat),
            'reference_number' => $this->reference($flat),
            'persons' => $this->persons($ocrText),
            'organizations' => $this->organizations($lines),
            'keywords' => [],
            'summary' => null,
            // Not a probability: rules either find a value in the text or leave it empty.
            'extraction_confidence' => null,
        ];

        return [
            'fields' => $fields,
            'found' => array_keys(array_filter($fields, fn ($v) => $v !== null && $v !== [])),
            'duration_ms' => (int) ((hrtime(true) - $started) / 1_000_000),
        ];
    }

    /** Lowercase, French accents and Arabic variants removed, Arabic digits → 0-9. */
    private static function flat(string $text): string
    {
        $text = ArabicText::forSearch($text);
        $text = Normalizer::normalize($text, Normalizer::FORM_D) ?: $text;

        return mb_strtolower(preg_replace('/\p{Mn}/u', '', $text));
    }

    /** First keyword (by position) in the title area, with Arabic prefixes و ف ب ل ال. */
    private function docType(array $lines): array
    {
        $best = [null, null, PHP_INT_MAX];
        foreach (array_slice($lines, 0, self::HEAD_LINES) as $i => $line) {
            $flat = self::flat($line);
            foreach (self::DOC_TYPES as $type => $keywords) {
                foreach ($keywords as $keyword) {
                    $arabic = (bool) preg_match('/\p{Arabic}/u', $keyword);
                    $pattern = $arabic
                        ? '/(?<!\p{L})(?:[وفبل])?(?:ال)?'.preg_quote($keyword, '/').'(?!\p{L})/u'
                        : '/(?<!\p{L})'.preg_quote($keyword, '/').'s?(?!\p{L})/u';
                    if (preg_match($pattern, $flat, $m, PREG_OFFSET_CAPTURE)) {
                        $position = $i * 10_000 + $m[0][1];
                        if ($position < $best[2]) {
                            $best = [$type, $line, $position];
                        }
                    }
                }
            }
        }

        return [$best[0], $best[1]];
    }

    /** The line naming the document type, otherwise the first real sentence that is not a letterhead. */
    private function title(array $lines, ?string $typeLine): ?string
    {
        if ($typeLine !== null && self::wordCount($typeLine) >= 2) {
            return mb_substr($typeLine, 0, 160);
        }
        foreach (array_slice($lines, 0, 12) as $line) {
            $letters = preg_match_all('/\p{L}/u', $line);
            if (self::wordCount($line) >= 2 && $letters >= 8 && $letters / max(1, mb_strlen($line)) >= 0.6 && ! $this->isOrganization($line)) {
                return mb_substr($line, 0, 160);
            }
        }

        return null;
    }

    /** First valid date of the text: 12/03/2019, 2019-03-12, 12 mars 2019, 12 مارس 2019. */
    private function date(string $flat): ?Carbon
    {
        $months = implode('|', array_map(fn ($m) => preg_quote($m, '/'), array_keys(self::MONTHS)));
        $candidates = [];
        if (preg_match_all('/(?<!\d)(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4})(?!\d)/u', $flat, $m, PREG_SET_ORDER | PREG_OFFSET_CAPTURE)) {
            foreach ($m as $x) {
                $candidates[] = [$x[0][1], (int) $x[3][0], (int) $x[2][0], (int) $x[1][0]];
            }
        }
        if (preg_match_all('/(?<!\d)(\d{4})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})(?!\d)/u', $flat, $m, PREG_SET_ORDER | PREG_OFFSET_CAPTURE)) {
            foreach ($m as $x) {
                $candidates[] = [$x[0][1], (int) $x[1][0], (int) $x[2][0], (int) $x[3][0]];
            }
        }
        if (preg_match_all('/(?<!\d)(\d{1,2})(?:er)?\s+('.$months.')\s+(\d{4})(?!\d)/u', $flat, $m, PREG_SET_ORDER | PREG_OFFSET_CAPTURE)) {
            foreach ($m as $x) {
                $candidates[] = [$x[0][1], (int) $x[3][0], self::MONTHS[$x[2][0]], (int) $x[1][0]];
            }
        }
        usort($candidates, fn ($a, $b) => $a[0] <=> $b[0]);
        foreach ($candidates as [, $year, $month, $day]) {
            if ($year >= 1900 && $year <= (int) date('Y') + 1 && checkdate($month, $day, $year)) {
                return Carbon::create($year, $month, $day)->startOfDay();
            }
        }

        return null;
    }

    /** The code after n°, réf., رقم, عدد, مرجع: "2019/145", "77/B", "2.19.145". */
    private function reference(string $flat): ?string
    {
        $pattern = '/(?:(?<!\p{L})(?:n\s?°|nº|no\.?|num(?:ero)?\.?|ref(?:erence)?\.?)|(?<!\p{L})(?:ب|و)?(?:ال)?(?:رقم|عدد|مرجع))\s*:?\s*'
            .'([0-9][0-9a-z]*(?:\s?[\/.\-]\s?[0-9a-z]+)*)/u';
        if (preg_match($pattern, $flat, $m)) {
            $reference = trim(preg_replace('/\s+/', '', $m[1]), '.-/');

            return $reference !== '' && preg_match('/\d/', $reference) ? mb_strtoupper(mb_substr($reference, 0, 40)) : null;
        }

        return null;
    }

    /** Names after M., Mme, Monsieur, السيد, السيدة… (capitalized words in French, two words in Arabic). */
    private function persons(string $text): array
    {
        $found = [];
        preg_match_all('/(?<!\p{L})(?:M\.|Mr\.?|Mme\.?|Mlle\.?|Monsieur|Madame|Dr\.?)\s+(\p{Lu}[\p{L}\'’\-]+(?:\s+\p{Lu}[\p{L}\'’\-]+){0,2})/u', $text, $m);
        array_push($found, ...$m[1]);
        preg_match_all('/(?<!\p{L})(?:ال)?(?:سيد|سيدة|سيده|دكتور|[اأ]ستاذ|[اأ]ستاذة)\s+(\p{Arabic}{2,}\s+\p{Arabic}{2,})/u', $text, $m);
        array_push($found, ...$m[1]);

        return array_slice(array_values(array_unique(array_map('trim', $found))), 0, 5);
    }

    /** Letterhead lines: Royaume du Maroc, Ministère de…, وزارة…, مديرية… */
    private function organizations(array $lines): array
    {
        $found = [];
        foreach (array_slice($lines, 0, 15) as $line) {
            if ($this->isOrganization($line) && mb_strlen($line) <= 100) {
                $found[] = $line;
            }
        }

        return array_slice(array_values(array_unique($found)), 0, 5);
    }

    private function isOrganization(string $line): bool
    {
        $flat = self::flat($line);
        foreach (self::ORGANIZATION_STARTS as $start) {
            if (preg_match('/^\W*(?:و)?'.preg_quote($start, '/').'(?!\p{L})/u', $flat)) {
                return true;
            }
        }

        return false;
    }

    private static function wordCount(string $line): int
    {
        return preg_match_all('/\p{L}{2,}/u', $line);
    }
}
