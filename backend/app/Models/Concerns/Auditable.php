<?php

namespace App\Models\Concerns;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/**
 * Records every change made by a logged-in desktop user in audit_logs.
 *
 * Changes made by the import and the processing pipeline (no user logged in)
 * are not recorded here: they are traced in imports and processing_logs, and
 * logging them would add millions of rows.
 */
trait Auditable
{
    public static function bootAuditable(): void
    {
        static::created(fn (Model $model) => $model->writeAudit('created', null, $model->auditable($model->getAttributes())));

        static::updated(function (Model $model) {
            $after = $model->auditable($model->getChanges());
            unset($after[$model->getUpdatedAtColumn()]);

            if ($after !== []) {
                $before = array_intersect_key($model->auditable($model->getRawOriginal()), $after);
                $model->writeAudit('updated', $before, $after);
            }
        });

        static::deleted(fn (Model $model) => $model->writeAudit('deleted', $model->auditable($model->getRawOriginal()), null));
    }

    /** Short entity name stored in audit_logs.entity, e.g. "box". */
    public function auditEntity(): string
    {
        return str(class_basename($this))->snake()->toString();
    }

    protected function auditable(array $attributes): array
    {
        $excluded = array_merge($this->getHidden(), ['created_at', 'updated_at']);

        return array_diff_key($attributes, array_flip($excluded));
    }

    protected function writeAudit(string $action, ?array $before, ?array $after): void
    {
        if (! Auth::check()) {
            return;
        }

        AuditLog::record($action, $this, $before, $after);
    }
}
