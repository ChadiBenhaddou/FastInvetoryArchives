<?php

namespace App\Events;

use Illuminate\Foundation\Events\Dispatchable;

/**
 * A new box and its photos were imported. The processing pipeline (OCR → extraction
 * → indexing) listens to this event.
 */
class BoxImported
{
    use Dispatchable;

    public function __construct(public readonly int $boxId) {}
}
