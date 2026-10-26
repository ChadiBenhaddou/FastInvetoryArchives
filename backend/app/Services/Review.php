<?php

namespace App\Services;

use App\Jobs\IndexDocumentJob;
use App\Models\Document;
use App\Models\User;

/**
 * Corrections made by a person on a document (box page). There is no validation step: a box is
 * "done" as soon as its photos are processed. A saved correction records who made it and clears
 * the document's problem flag; every change goes to the audit log (Auditable on Document).
 */
class Review
{
    public function saveDocument(Document $doc, array $fields, User $user): Document
    {
        $doc->fill($fields);
        $doc->needs_review = false;
        $doc->reviewed_by = $user->id;
        $doc->reviewed_at = now();
        $doc->save();

        IndexDocumentJob::dispatch($doc->id); // search shows the corrected values

        return $doc;
    }
}
