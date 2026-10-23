<?php

namespace App\Services;

use App\Enums\BoxStatus;
use App\Jobs\IndexDocumentJob;
use App\Models\Box;
use App\Models\Document;
use App\Models\User;

/**
 * Human review: a reviewer checks/corrects each document of a box. Every change goes to
 * the audit log (Auditable on Document); the box is "done" once all its documents are reviewed.
 */
class Review
{
    /** Saves the reviewer's corrections; $approve marks the document as reviewed. */
    public function saveDocument(Document $doc, array $fields, User $user, bool $approve): Document
    {
        $doc->fill($fields);
        if ($approve) {
            $doc->needs_review = false;
            $doc->reviewed_by = $user->id;
            $doc->reviewed_at = now();
        }
        $doc->save();

        IndexDocumentJob::dispatch($doc->id); // search shows the corrected values
        $this->closeBoxIfReviewed($doc->box_id);

        return $doc;
    }

    public function approveBox(Box $box, User $user): void
    {
        foreach ($box->documents()->whereNull('reviewed_at')->get() as $doc) {
            $this->saveDocument($doc, [], $user, approve: true);
        }
        $this->closeBoxIfReviewed($box->id);
    }

    public function closeBoxIfReviewed(int $boxId): void
    {
        $box = Box::find($boxId);
        if ($box && $box->status === BoxStatus::Review && ! $box->documents()->whereNull('reviewed_at')->exists()) {
            $box->update(['status' => BoxStatus::Done]);
        }
    }

    /** Next box waiting for review (oldest first), skipping the ones passed over. */
    public function nextBox(array $skip = []): ?Box
    {
        return Box::where('status', BoxStatus::Review)
            ->whereNotIn('id', $skip)
            ->orderBy('created_on_phone_at')->orderBy('id')
            ->first();
    }
}
