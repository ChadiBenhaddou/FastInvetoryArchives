<?php

namespace App\Services\Import;

use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Validator;

/**
 * Validates manifest.json against shared/manifest.schema.json — the same contract
 * the phone app is tested against.
 */
class ManifestValidator
{
    private ?string $schema = null;

    /**
     * @return array<string, mixed> the manifest as an associative array
     *
     * @throws ImportFailed
     */
    public function parse(string $json): array
    {
        $data = json_decode($json);
        if (json_last_error() !== JSON_ERROR_NONE || ! is_object($data)) {
            throw new ImportFailed('manifest.json n\'est pas un JSON valide ('.json_last_error_msg().').');
        }

        $validator = (new Validator)->setMaxErrors(10);
        $result = $validator->validate($data, $this->schema());

        if (! $result->isValid()) {
            $details = [];
            foreach ((new ErrorFormatter)->format($result->error()) as $path => $messages) {
                foreach ((array) $messages as $message) {
                    $details[] = ($path === '/' ? '' : "{$path} : ").$message;
                }
            }
            throw new ImportFailed('manifest.json ne respecte pas le format attendu.', array_slice($details, 0, 10));
        }

        return json_decode($json, true);
    }

    private function schema(): string
    {
        return $this->schema ??= file_get_contents(config('archive.import.manifest_schema'))
            ?: throw new \RuntimeException('Manifest schema not found');
    }
}
