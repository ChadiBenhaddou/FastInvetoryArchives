<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

#[Fillable(['user_id', 'entity', 'entity_id', 'action', 'before', 'after'])]
class AuditLog extends Model
{
    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return [
            'before' => 'array',
            'after' => 'array',
            'created_at' => 'datetime',
        ];
    }

    /**
     * Record an action. $subject is a model, or an entity name for actions
     * that are not tied to one row (e.g. "export", "backup").
     */
    public static function record(string $action, Model|string $subject, ?array $before = null, ?array $after = null): self
    {
        return static::create([
            'user_id' => Auth::id(),
            'entity' => is_string($subject) ? $subject : (method_exists($subject, 'auditEntity') ? $subject->auditEntity() : class_basename($subject)),
            'entity_id' => is_string($subject) ? null : $subject->getKey(),
            'action' => $action,
            'before' => $before,
            'after' => $after,
        ]);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
