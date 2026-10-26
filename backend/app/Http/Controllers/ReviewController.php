<?php

namespace App\Http\Controllers;

use App\Http\Resources\DocumentResource;
use App\Models\Document;
use App\Services\Review;
use Illuminate\Http\Request;

class ReviewController extends Controller
{
    /** Corrections on one document, from the box page (there is no validation step). */
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

        $doc = $review->saveDocument($document, $fields, $request->user());

        return new DocumentResource($doc->load('reviewer'));
    }
}
