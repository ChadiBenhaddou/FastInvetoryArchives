<?php

namespace App\Enums;

enum UserRole: string
{
    /** Full access: import, devices, users, export, backup, code corrections. */
    case Admin = 'admin';
    /** Consults boxes, reviews and corrects extracted data, searches. */
    case Reviewer = 'reviewer';

    public function label(): string
    {
        return match ($this) {
            self::Admin => 'Administrateur',
            self::Reviewer => 'Réviseur',
        };
    }
}
