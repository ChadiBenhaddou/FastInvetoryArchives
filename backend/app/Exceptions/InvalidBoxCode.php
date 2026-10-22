<?php

namespace App\Exceptions;

use InvalidArgumentException;

class InvalidBoxCode extends InvalidArgumentException
{
    public function __construct(
        public readonly string $input,
        public readonly string $reason,
        string $message,
    ) {
        parent::__construct($message);
    }

    public static function format(string $input): self
    {
        return new self($input, 'format', "Code « {$input} » : format invalide (attendu A-0123-N).");
    }

    public static function device(string $input): self
    {
        return new self($input, 'device', "Code « {$input} » : lettre d'appareil non autorisée.");
    }

    public static function sequence(string $input): self
    {
        return new self($input, 'sequence', "Code « {$input} » : numéro de séquence hors limites (0001-9999).");
    }

    public static function checksum(string $input): self
    {
        return new self($input, 'checksum', "Code « {$input} » : lettre de contrôle incorrecte (code mal recopié ?).");
    }
}
