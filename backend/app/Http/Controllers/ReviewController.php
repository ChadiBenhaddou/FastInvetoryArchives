<?php

namespace App\Http\Controllers;

use App\Enums\BoxStatus;
use App\Http\Resources\BoxResource;
use App\Http\Resources\DocumentResource;
use App\Models\Box;
use App\Models\BoxConflict;
use App\Models\Document;
use App\Services\Review;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReviewController extends Controller
{
    /** Next box to review, with everything the review screen needs. */
    public function next(Request $request, Review $review): JsonResponse
    {
        $skip = array_filter(array_map('intval', explode(',', (string) $request->query('skip', ''))));
        $box = $review->nextBox($skip);
        $remaining = Box::where('status', BoxStatus::Review)->count();

        if (! $box) {
            return response()->json(['data' => null, 'remaining' => $remaining]);
        }
        $box->load(['device', 'images.document.reviewer']);
        $box->pending_conflicts = BoxConflict::where('existing_box_id', $box->id)->where('status', 'pending')->count();

        return (new BoxResource($box))->additional(['remaining' => $remaining])->response();
    }

    /** Reviewer's corrections on one document; "approve" marks it reviewed. */
    public function updateDocument(Request $request, Document $document, Review $review): DocumentResource
    {
        $fields = $request->validate([
            'doc_type' => ['nullable', 'string', 'max:100'],
            'title' => ['nullable', 'string', 'max:500'],
            'doc_date' => ['nullable', 'date_format:Y-m-d'],
            'reference_number' => ['nullable', 'string', 'max:255'],
            'persons' => ['array', 'max:50'],
            'persons.*' => ['string', 'max:255'],
            'organizations' => ['array', 'max:50'],
            'organizations.*' => ['string', 'max:255'],
            'keywords' => ['array', 'max:8'],
            'keywords.*' => ['string', 'max:100'],
            'summary' => ['nullable', 'string', 'max:2000'],
            'ocr_text' => ['nullable', 'string', 'max:100000'],
        ]);
        $approve = $request->boolean('approve');

        $doc = $review->saveDocument($document, $fields, $request->user(), $approve);

        return new DocumentResource($doc->load('reviewer'));
    }
}
