<?php

namespace App\Enums;

enum BoxStatus: string
{
    case Imported = 'imported';
    case Processing = 'processing';
    case Review = 'review';
    case Done = 'done';
}
