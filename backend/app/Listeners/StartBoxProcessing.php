<?php

namespace App\Listeners;

use App\Events\BoxImported;
use App\Models\Box;
use App\Services\Pipeline;

/** Every imported box goes straight into the processing pipeline. */
class StartBoxProcessing
{
    public function __construct(private readonly Pipeline $pipeline) {}

    public function handle(BoxImported $event): void
    {
        if ($box = Box::find($event->boxId)) {
            $this->pipeline->startBox($box);
        }
    }
}
