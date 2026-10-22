<?php

namespace App\Rules;

use App\Exceptions\InvalidBoxCode;
use App\Support\BoxCode;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class ValidBoxCode implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        try {
            BoxCode::parse((string) $value);
        } catch (InvalidBoxCode $e) {
            $fail($e->getMessage());
        }
    }
}
