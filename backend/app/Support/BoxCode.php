<?php

namespace App\Support;

use App\Exceptions\InvalidBoxCode;
use Stringable;

/**
 * A box code such as "A-0123-N": device letter, 4-digit sequence, check letter.
 * The algorithm is specified in shared/BOX_CODE.md.
 */
final class BoxCode implements Stringable
{
    /** 21 letters: the Latin alphabet minus the confusable O I S B Z. */
    public const ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY';

    /** Weights for [device, d1, d2, d3, d4]; all coprime with 21. */
    private const WEIGHTS = [13, 8, 4, 2, 1];

    public const MAX_SEQUENCE = 9999;

    private function __construct(
        public readonly string $device,
        public readonly int $sequence,
    ) {}

    public static function make(string $device, int $sequence): self
    {
        $device = strtoupper($device);

        if (! self::isValidDeviceLetter($device)) {
            throw InvalidBoxCode::device($device);
        }
        if ($sequence < 1 || $sequence > self::MAX_SEQUENCE) {
            throw InvalidBoxCode::sequence((string) $sequence);
        }

        return new self($device, $sequence);
    }

    /**
     * Parse a typed or imported code, normalizing case and separators.
     *
     * @throws InvalidBoxCode
     */
    public static function parse(string $input): self
    {
        $normalized = self::normalize($input);

        if (! preg_match('/^([A-Z])-(\d{4})-([A-Z])$/', $normalized, $m)) {
            throw InvalidBoxCode::format($input);
        }
        [, $device, $digits, $check] = $m;

        if (! self::isValidDeviceLetter($device)) {
            throw InvalidBoxCode::device($input);
        }
        if (! str_contains(self::ALPHABET, $check)) {
            throw InvalidBoxCode::format($input);
        }
        if ((int) $digits < 1) {
            throw InvalidBoxCode::sequence($input);
        }
        if (self::checkLetter($device, (int) $digits) !== $check) {
            throw InvalidBoxCode::checksum($input);
        }

        return new self($device, (int) $digits);
    }

    public static function tryParse(?string $input): ?self
    {
        try {
            return $input === null ? null : self::parse($input);
        } catch (InvalidBoxCode) {
            return null;
        }
    }

    public static function isValid(?string $input): bool
    {
        return self::tryParse($input) !== null;
    }

    /** "a 0123 n" / "A0123N" / "A–0123–N" → "A-0123-N" (structure only, no validation). */
    public static function normalize(string $input): string
    {
        $compact = preg_replace('/[\s\-\x{2010}-\x{2015}_]+/u', '', mb_strtoupper(trim($input)));

        if (preg_match('/^([A-Z])(\d{4})([A-Z])$/', $compact, $m)) {
            return "{$m[1]}-{$m[2]}-{$m[3]}";
        }

        return $compact;
    }

    public static function isValidDeviceLetter(string $letter): bool
    {
        return strlen($letter) === 1 && str_contains(self::ALPHABET, $letter);
    }

    public static function checkLetter(string $device, int $sequence): string
    {
        $values = [strpos(self::ALPHABET, $device)];
        foreach (str_split(sprintf('%04d', $sequence)) as $digit) {
            $values[] = (int) $digit;
        }

        $sum = 0;
        foreach (self::WEIGHTS as $i => $weight) {
            $sum += $weight * $values[$i];
        }

        return self::ALPHABET[$sum % strlen(self::ALPHABET)];
    }

    public function checkChar(): string
    {
        return self::checkLetter($this->device, $this->sequence);
    }

    public function value(): string
    {
        return sprintf('%s-%04d-%s', $this->device, $this->sequence, $this->checkChar());
    }

    public function __toString(): string
    {
        return $this->value();
    }
}
