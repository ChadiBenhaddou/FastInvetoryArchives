<?php

namespace App\Services\Search;

use App\Models\Document;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/**
 * The "documents" index in the local Meilisearch: full text of the OCR + extracted fields,
 * filterable by box, type, year, place and agent. Arabic and French text.
 */
class SearchIndex
{
    public const INDEX = 'documents';

    public const SETTINGS = [
        // Order = relevance weight: a match in the title counts more than one in the body.
        'searchableAttributes' => [
            'title', 'reference_number', 'persons', 'organizations', 'keywords', 'summary', 'ocr_text', 'box_code',
        ],
        'filterableAttributes' => [
            'box_code', 'box_id', 'doc_type', 'year', 'room', 'shelf', 'agent_name', 'device', 'language', 'needs_review',
        ],
        'sortableAttributes' => ['doc_date_ts', 'box_code'],
        'displayedAttributes' => ['*'],
        // Restrict language detection to the archive's two languages (better Arabic tokenization).
        'localizedAttributes' => [['attributePatterns' => ['*'], 'locales' => ['ara', 'fra']]],
        // Meilisearch splits the Arabic article «ال» into its own token: without this, a search
        // for «الداخلية» matches every Arabic document through «ال». Same idea for the most
        // frequent French/Arabic function words.
        'stopWords' => [
            'ال', 'و', 'في', 'من', 'على', 'إلى', 'الى', 'عن', 'أن', 'ان', 'مع', 'هذا', 'هذه', 'التي', 'الذي',
            'le', 'la', 'les', 'l', 'de', 'des', 'du', 'd', 'et', 'à', 'a', 'au', 'aux', 'en', 'un', 'une', 'pour', 'par', 'sur',
        ],
        'pagination' => ['maxTotalHits' => 5000],
        'faceting' => ['maxValuesPerFacet' => 200],
    ];

    private function client(): PendingRequest
    {
        return Http::baseUrl(rtrim(config('archive.meilisearch.host'), '/'))
            ->withToken(config('archive.meilisearch.key'))
            ->acceptJson()
            ->timeout(30);
    }

    /** Creates the index and applies its settings (idempotent; run at every start). */
    public function setup(): void
    {
        $this->client()->post('/indexes', ['uid' => self::INDEX, 'primaryKey' => 'id']); // 4xx if it exists: fine
        $this->client()->patch('/indexes/'.self::INDEX.'/settings', self::SETTINGS)->throw();
    }

    /** Adds or replaces documents (Meilisearch processes the task asynchronously). */
    public function upsert(Document ...$documents): void
    {
        if (! $documents) {
            return;
        }
        $this->client()
            ->post('/indexes/'.self::INDEX.'/documents?primaryKey=id', array_map([$this, 'toSearchDocument'], $documents))
            ->throw();
    }

    public function delete(int ...$ids): void
    {
        $this->client()->post('/indexes/'.self::INDEX.'/documents/delete-batch', $ids)->throw();
    }

    /** Raw Meilisearch search (the search page builds on this in deliverable 6). */
    public function search(string $query, array $options = []): array
    {
        return $this->client()->post('/indexes/'.self::INDEX.'/search', ['q' => $query, ...$options])->throw()->json();
    }

    public function toSearchDocument(Document $doc): array
    {
        $doc->loadMissing(['box.device', 'image']);
        $box = $doc->box;

        return [
            'id' => $doc->id,
            'box_id' => $box->id,
            'box_code' => $box->code,
            'image_id' => $doc->image_id,
            'sequence' => $doc->image?->sequence,
            'room' => $box->room,
            'shelf' => $box->shelf,
            'row' => $box->row,
            'agent_name' => $box->agent_name,
            'device' => $box->device?->letter,
            'doc_type' => $doc->doc_type,
            'title' => $doc->title,
            'summary' => $doc->summary,
            'reference_number' => $doc->reference_number,
            'persons' => $doc->persons ?? [],
            'organizations' => $doc->organizations ?? [],
            'keywords' => $doc->keywords ?? [],
            'ocr_text' => $doc->ocr_text,
            'language' => $doc->language,
            'doc_date' => $doc->doc_date?->format('Y-m-d'),
            'doc_date_ts' => $doc->doc_date?->getTimestamp(),
            'year' => $doc->doc_date ? (int) $doc->doc_date->format('Y') : null,
            'needs_review' => $doc->needs_review,
        ];
    }
}
