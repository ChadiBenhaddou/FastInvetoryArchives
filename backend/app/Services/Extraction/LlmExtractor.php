<?php

namespace App\Services\Extraction;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Structured metadata from the OCR text of one document, by the local LLM (Ollama).
 *
 * The model is constrained by a JSON schema (it cannot answer anything else), the answer
 * is validated and retried once, then every value is checked against the OCR text:
 * a value that does not appear in the document is dropped ("never invent values").
 */
class LlmExtractor
{
    public const PROMPT = <<<'TXT'
You are an archivist. From the OCR text of one administrative document (Arabic and/or French, may contain OCR errors), extract ONLY information that is present. Return strict JSON:
{doc_type, title, doc_date (YYYY-MM-DD or null), reference_number, persons[], organizations[], keywords[] (max 8), summary (1 sentence, in French), language, confidence (0-1)}.
Never invent values; use null when unknown. Do not translate names.
doc_type: a short French noun such as arrêté, décision, décret, circulaire, note de service, correspondance, procès-verbal, rapport, demande, attestation, contrat, facture, état, liste, autre.
reference_number: the number or code only, as written (e.g. 2019/145), without any other word.
keywords: 3 to 5. summary: one short sentence (25 words at most).
language: "ar", "fr" or "mixed". confidence: how sure you are that the extracted values are correct.
TXT;

    public const SCHEMA = [
        'type' => 'object',
        'properties' => [
            'doc_type' => ['type' => ['string', 'null']],
            'title' => ['type' => ['string', 'null']],
            'doc_date' => ['type' => ['string', 'null']],
            'reference_number' => ['type' => ['string', 'null']],
            'persons' => ['type' => 'array', 'items' => ['type' => 'string']],
            'organizations' => ['type' => 'array', 'items' => ['type' => 'string']],
            'keywords' => ['type' => 'array', 'items' => ['type' => 'string'], 'maxItems' => 8],
            'summary' => ['type' => ['string', 'null']],
            'language' => ['type' => ['string', 'null']],
            'confidence' => ['type' => 'number'],
        ],
        'required' => ['doc_type', 'title', 'doc_date', 'reference_number', 'persons', 'organizations', 'keywords', 'summary', 'language', 'confidence'],
    ];

    /**
     * @return array{fields: array, raw: string, attempts: int, dropped: string[], duration_ms: int, model: string}
     *
     * @throws ExtractionFailed when the model never returns valid JSON
     */
    public function extract(string $ocrText, ?string $model = null): array
    {
        $model ??= config('archive.llm.model');
        $text = mb_substr(trim($ocrText), 0, config('archive.llm.max_chars'));
        $messages = [
            ['role' => 'system', 'content' => self::PROMPT],
            ['role' => 'user', 'content' => "OCR text:\n<<<\n{$text}\n>>>"],
        ];

        $started = hrtime(true);
        $raw = '';
        for ($attempt = 1; $attempt <= 2; $attempt++) {
            [$raw, $stats] = $this->chat($model, $messages);
            $data = json_decode($raw, true);
            if (is_array($data) && ! array_is_list($data)) {
                [$fields, $dropped] = $this->clean($data, new TextMatcher($ocrText));

                return [
                    'fields' => $fields,
                    'raw' => $raw,
                    'attempts' => $attempt,
                    'dropped' => $dropped,
                    'duration_ms' => (int) ((hrtime(true) - $started) / 1_000_000),
                    'model' => $model,
                    'stats' => $stats,
                ];
            }
            // Second chance, reminding the model of the expected format.
            $messages[] = ['role' => 'assistant', 'content' => $raw];
            $messages[] = ['role' => 'user', 'content' => 'Invalid answer. Reply with the JSON object only.'];
        }

        throw new ExtractionFailed('Réponse JSON invalide après 2 essais : '.mb_substr($raw, 0, 200));
    }

    /**
     * @return array{0: string, 1: array{prompt_tokens: int, prompt_s: float, output_tokens: int, output_s: float}}
     */
    private function chat(string $model, array $messages): array
    {
        $response = Http::timeout(config('archive.llm.timeout'))
            ->post(rtrim(config('archive.llm.url'), '/').'/api/chat', [
                'model' => $model,
                'messages' => $messages,
                'format' => self::SCHEMA,
                'stream' => false,
                'keep_alive' => -1, // stay loaded: reloading a 7B model costs ~10 s per document
                'options' => array_filter([
                    'temperature' => 0,
                    'num_ctx' => config('archive.llm.context'),
                    'num_predict' => config('archive.llm.max_output_tokens'),
                    // Ollama defaults to half the logical CPUs; the archive PC runs mostly this.
                    'num_thread' => config('archive.llm.threads'),
                ], fn ($v) => $v !== null),
            ]);

        if ($response->failed()) {
            throw new RuntimeException("Ollama HTTP {$response->status()}: ".mb_substr($response->body(), 0, 300));
        }

        // Where the CPU time goes: reading the prompt vs writing the answer.
        $stats = [
            'prompt_tokens' => (int) $response->json('prompt_eval_count', 0),
            'prompt_s' => round($response->json('prompt_eval_duration', 0) / 1e9, 1),
            'output_tokens' => (int) $response->json('eval_count', 0),
            'output_s' => round($response->json('eval_duration', 0) / 1e9, 1),
        ];

        return [(string) $response->json('message.content', ''), $stats];
    }

    /**
     * Normalizes the model answer and drops what is not supported by the OCR text.
     *
     * @return array{0: array, 1: string[]}
     */
    private function clean(array $d, TextMatcher $text): array
    {
        $dropped = [];
        $str = fn ($v, int $max) => is_string($v) && trim($v) !== '' && ! in_array(mb_strtolower(trim($v)), ['null', 'n/a', 'inconnu', 'unknown'], true)
            ? mb_substr(trim($v), 0, $max) : null;
        $list = fn ($v, int $max) => array_slice(array_values(array_unique(array_filter(
            array_map(fn ($x) => is_string($x) ? trim($x) : '', is_array($v) ? $v : []),
            fn ($x) => $x !== '',
        ))), 0, $max);

        $reference = $str($d['reference_number'] ?? null, 255);
        if ($reference !== null && ! preg_match('/\d/', $reference)) {
            $reference = null; // a reference number always has digits ("Ministère" is not one)
        }
        if ($reference !== null && preg_match('/\s/u', $reference)) {
            // "n° 2019/145", "77/B — Correspondance 1998" → keep the code itself.
            $codes = preg_grep('/\d/', preg_split('/\s+/u', $reference));
            $reference = $codes ? trim(reset($codes), '.,;:—–-') : null;
        }
        if ($reference !== null && ! $text->containsCompact($reference)) {
            $dropped[] = "référence « {$reference} »";
            $reference = null;
        }

        $date = $str($d['doc_date'] ?? null, 10);
        if ($date !== null) {
            $valid = preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1])
                && (int) $m[1] >= 1800 && (int) $m[1] <= (int) date('Y') + 1;
            if (! $valid || ! $text->containsYear($m[1])) {
                $dropped[] = "date « {$date} »";
                $date = null;
            }
        }

        $keepPresent = function (array $values, string $label) use ($text, &$dropped) {
            return array_values(array_filter($values, function ($v) use ($text, $label, &$dropped) {
                if ($text->containsPhrase($v)) {
                    return true;
                }
                $dropped[] = "{$label} « {$v} »";

                return false;
            }));
        };

        $persons = $keepPresent($list($d['persons'] ?? [], 20), 'personne');
        $organizations = $keepPresent($list($d['organizations'] ?? [], 20), 'organisme');

        $confidence = is_numeric($d['confidence'] ?? null) ? max(0.0, min(1.0, (float) $d['confidence'])) : 0.0;
        // Each invented value lowers the trust in the rest of the answer.
        $confidence = round(max(0.0, $confidence - 0.15 * count($dropped)), 3);

        $language = $str($d['language'] ?? null, 10);

        return [[
            'doc_type' => ($t = $str($d['doc_type'] ?? null, 100)) ? mb_strtolower($t) : null,
            'title' => $str($d['title'] ?? null, 500),
            'doc_date' => $date ? Carbon::createFromFormat('Y-m-d', $date)->startOfDay() : null,
            'reference_number' => $reference,
            'persons' => $persons,
            'organizations' => $organizations,
            'keywords' => $list($d['keywords'] ?? [], 8),
            'summary' => $str($d['summary'] ?? null, 1000),
            'language' => in_array($language, ['ar', 'fr', 'mixed'], true) ? $language : null,
            'extraction_confidence' => $confidence,
        ], $dropped];
    }
}
