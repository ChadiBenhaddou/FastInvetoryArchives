<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Services\Search\SearchIndex;
use App\Support\ArabicText;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Full-text search over OCR text + extracted fields (Arabic and French), with filters.
 * Matches are delimited with private-use characters (not HTML) so that OCR text can never
 * inject markup into the page; the UI turns them into highlights.
 */
class SearchController extends Controller
{
    public const MARK_START = "\u{E000}";
    public const MARK_END = "\u{E001}";

    public function __invoke(Request $request, SearchIndex $index): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:500'],
            'box' => ['nullable', 'string', 'max:20'],
            'doc_type' => ['nullable', 'string', 'max:100'],
            'year_from' => ['nullable', 'integer', 'min:1800', 'max:2100'],
            'year_to' => ['nullable', 'integer', 'min:1800', 'max:2100'],
            'room' => ['nullable', 'string', 'max:255'],
            'agent' => ['nullable', 'string', 'max:255'],
            'device' => ['nullable', 'string', 'size:1'],
            'needs_review' => ['nullable', 'boolean'],
            'page' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        $quote = fn (string $v) => '"'.str_replace(['\\', '"'], ['\\\\', '\\"'], $v).'"';
        $filters = array_values(array_filter([
            isset($data['box']) ? 'box_code = '.$quote(strtoupper(trim($data['box']))) : null,
            isset($data['doc_type']) ? 'doc_type = '.$quote($data['doc_type']) : null,
            isset($data['year_from']) ? 'year >= '.(int) $data['year_from'] : null,
            isset($data['year_to']) ? 'year <= '.(int) $data['year_to'] : null,
            isset($data['room']) ? 'room = '.$quote($data['room']) : null,
            isset($data['agent']) ? 'agent_name = '.$quote($data['agent']) : null,
            isset($data['device']) ? 'device = '.$quote(strtoupper($data['device'])) : null,
            isset($data['needs_review']) ? 'needs_review = '.($data['needs_review'] ? 'true' : 'false') : null,
        ]));

        // Same normalization as the indexed *_search copies (أ/إ/آ → ا, ة → ه, diacritics…).
        $result = $index->search(ArabicText::forSearch($data['q'] ?? ''), [
            'filter' => $filters,
            'page' => (int) ($data['page'] ?? 1),
            'hitsPerPage' => 20,
            'facets' => ['doc_type', 'year', 'room', 'agent_name', 'device'],
            // ocr_text must be listed here too: cropping alone does not highlight.
            'attributesToHighlight' => ['title', 'summary', 'reference_number', 'persons', 'organizations', 'keywords', 'ocr_text', 'ocr_text_search'],
            'attributesToCrop' => ['ocr_text', 'ocr_text_search'],
            'cropLength' => 35,
            'highlightPreTag' => self::MARK_START,
            'highlightPostTag' => self::MARK_END,
            'cropMarker' => '…',
            'showMatchesPosition' => false,
        ]);

        if (filled($data['q'] ?? null)) {
            AuditLog::record('search', 'document', null, ['q' => $data['q'], 'filters' => $filters]);
        }

        return response()->json([
            'query' => $data['q'] ?? '',
            'total' => $result['totalHits'] ?? count($result['hits']),
            'page' => $result['page'] ?? 1,
            'pages' => $result['totalPages'] ?? 1,
            'processing_ms' => $result['processingTimeMs'] ?? null,
            'facets' => $result['facetDistribution'] ?? (object) [],
            'hits' => array_map(fn ($hit) => [
                'id' => $hit['id'],
                'box_id' => $hit['box_id'],
                'box_code' => $hit['box_code'],
                'image_id' => $hit['image_id'],
                'sequence' => $hit['sequence'],
                'thumb_url' => "/api/images/{$hit['image_id']}/thumb",
                'location' => array_filter(['room' => $hit['room'], 'shelf' => $hit['shelf'], 'row' => $hit['row']]),
                'agent_name' => $hit['agent_name'],
                'doc_type' => $hit['doc_type'],
                'doc_date' => $hit['doc_date'],
                'needs_review' => $hit['needs_review'],
                'title' => $hit['_formatted']['title'] ?? $hit['title'],
                'reference_number' => $hit['_formatted']['reference_number'] ?? $hit['reference_number'],
                'summary' => $hit['_formatted']['summary'] ?? $hit['summary'],
                'snippet' => $this->snippet($hit['_formatted'] ?? []),
                'language' => $hit['language'],
            ], $result['hits']),
        ]);
    }

    /**
     * The OCR text as stored, around the match. When the word only matched in the normalized
     * copy (searched without hamza, text written with it…), that copy is shown instead.
     */
    private function snippet(array $formatted): ?string
    {
        $original = $formatted['ocr_text'] ?? null;
        $normalized = $formatted['ocr_text_search'] ?? null;
        if ($original !== null && str_contains($original, self::MARK_START)) {
            return $original;
        }

        return $normalized !== null && str_contains($normalized, self::MARK_START) ? $normalized : $original;
    }
}
