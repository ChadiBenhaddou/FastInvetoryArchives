<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['device_id', 'sequence', 'import_id'])]
class VoidedSequence extends Model
{
    public const UPDATED_AT = null;
}
