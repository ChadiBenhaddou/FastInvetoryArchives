<?php

namespace App\Enums;

enum ImportStatus: string
{
    case Pending = 'pending';
    case Processing = 'processing';
    case Completed = 'completed';
    /** Imported, but some boxes were conflicts or had errors: see the report. */
    case CompletedWithIssues = 'completed_with_issues';
    case Failed = 'failed';
}
