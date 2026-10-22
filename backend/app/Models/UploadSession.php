<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'file_name', 'size', 'received', 'import_id'])]
class UploadSession extends Model
{
    use HasUuids;

    protected function casts(): array
    {
        return ['size' => 'integer', 'received' => 'integer'];
    }

    /** Partial file in the app's private storage. */
    public function partPath(): string
    {
        return storage_path("app/uploads/{$this->id}.part");
    }
}
