<?php

namespace App\Enums;

enum OcrStatus: string
{
    case Pending = 'pending';
    case Processing = 'processing';
    case Done = 'done';
    case Failed = 'failed';
    /** Code photos are not OCR'd as documents. */
    case Skipped = 'skipped';
}
