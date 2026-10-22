<?php

namespace App\Services\Import;

use RuntimeException;

/** The whole ZIP is rejected (unreadable, invalid manifest, unknown device...). */
class ImportFailed extends RuntimeException
{
    /** @param string[] $details */
    public function __construct(string $message, public readonly array $details = [])
    {
        parent::__construct($message);
    }
}
