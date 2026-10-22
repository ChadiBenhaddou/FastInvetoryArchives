<?php

namespace App\Services\Import;

/**
 * What happened during one import, stored as JSON in imports.report and shown
 * on the Import page (and written next to failed ZIPs as a .txt).
 */
class ImportReport
{
    public ?string $fatal = null;
    /** @var string[] */
    public array $fatalDetails = [];
    /** @var array<string, int> code => photo count */
    public array $added = [];
    /** @var string[] */
    public array $duplicates = [];
    /** @var array<int, array{code: string, message: string}> */
    public array $conflicts = [];
    /** @var array<int, array{code: ?string, message: string}> */
    public array $errors = [];
    /** @var string[] */
    public array $warnings = [];
    /** @var int[] */
    public array $voided = [];
    /** @var array<int, array{from: int, to: int, count: int, first_code: string, last_code: string}> */
    public array $gaps = [];
    public ?int $duplicateOf = null;

    public function boxAdded(string $code, int $photos): void
    {
        $this->added[$code] = $photos;
    }

    public function boxError(?string $code, string $message): void
    {
        $this->errors[] = ['code' => $code, 'message' => $message];
    }

    public function conflict(string $code, string $message): void
    {
        $this->conflicts[] = ['code' => $code, 'message' => $message];
    }

    public function photosAdded(): int
    {
        return array_sum($this->added);
    }

    public function hasIssues(): bool
    {
        return $this->errors !== [] || $this->conflicts !== [];
    }

    public function toArray(): array
    {
        return [
            'summary' => [
                'boxes_added' => count($this->added),
                'photos_added' => $this->photosAdded(),
                'duplicates_skipped' => count($this->duplicates),
                'conflicts' => count($this->conflicts),
                'errors' => count($this->errors) + ($this->fatal ? 1 : 0),
            ],
            'fatal' => $this->fatal,
            'fatal_details' => $this->fatalDetails,
            'duplicate_of' => $this->duplicateOf,
            'boxes_added' => array_keys($this->added),
            'duplicates' => $this->duplicates,
            'conflicts' => $this->conflicts,
            'errors' => $this->errors,
            'warnings' => $this->warnings,
            'voided' => $this->voided,
            'gaps' => $this->gaps,
        ];
    }

    /** Plain-text version, written next to a ZIP moved to failed/. */
    public function toText(string $fileName): string
    {
        $lines = ["Import de {$fileName} — ".now()->format('d/m/Y H:i'), ''];
        if ($this->fatal) {
            $lines[] = "ÉCHEC : {$this->fatal}";
            foreach ($this->fatalDetails as $detail) {
                $lines[] = "  - {$detail}";
            }
            $lines[] = '';
        }
        $lines[] = sprintf('Boîtes ajoutées : %d (%d photos)', count($this->added), $this->photosAdded());
        $lines[] = sprintf('Doublons ignorés : %d', count($this->duplicates));
        foreach ($this->conflicts as $c) {
            $lines[] = "CONFLIT {$c['code']} : {$c['message']}";
        }
        foreach ($this->errors as $e) {
            $lines[] = 'ERREUR '.($e['code'] ? "{$e['code']} " : '').": {$e['message']}";
        }
        foreach ($this->warnings as $w) {
            $lines[] = "ATTENTION : {$w}";
        }
        $lines[] = '';
        $lines[] = "Que faire : corriger le problème (recopier le fichier depuis le téléphone, ou « Ré-exporter »"
            ." dans l'historique de l'application), puis redéposer le ZIP dans le dossier import.";

        return implode(PHP_EOL, $lines).PHP_EOL;
    }
}
