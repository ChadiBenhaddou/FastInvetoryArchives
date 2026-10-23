<?php

namespace App\Console\Commands;

use App\Models\Document;
use App\Services\Extraction\ExtractionFailed;
use App\Services\Extraction\LlmExtractor;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Throwable;

/**
 * Measures how long each LLM takes per document ON THIS PC, with the real prompt and
 * real OCR texts, to choose LLM_MODEL. Nothing is saved.
 */
#[Signature('archive:llm-benchmark {--model=* : Ollama model(s) to compare (default: the configured one)} {--limit=5 : Documents per model} {--threads= : CPU threads for the LLM (default: LLM_THREADS / Ollama)} {--show : Print each answer}')]
#[Description('Compare LLM models on this PC: seconds per document and quality of the answers')]
class LlmBenchmark extends Command
{
    public function handle(LlmExtractor $extractor): int
    {
        if ($this->option('threads')) {
            config(['archive.llm.threads' => (int) $this->option('threads')]);
        }
        $docs = Document::whereNotNull('ocr_text')->where('ocr_text', '!=', '')
            ->latest('id')->limit((int) $this->option('limit'))->get();
        if ($docs->isEmpty()) {
            $this->error("Aucun document avec du texte OCR : importer d'abord un export.");

            return self::FAILURE;
        }

        $rows = [];
        foreach ($this->option('model') ?: [config('archive.llm.model')] as $model) {
            $this->line("» {$model}");
            // Warm-up: the first call also loads the model in memory (not counted).
            try {
                $extractor->extract('Arrêté n° 1 du 2 janvier 2000', $model);
            } catch (Throwable $e) {
                $this->error("  indisponible : {$e->getMessage()}");

                continue;
            }

            $times = [];
            $valid = $dropped = $filled = 0;
            foreach ($docs as $doc) {
                try {
                    $r = $extractor->extract($doc->ocr_text, $model);
                    $times[] = $r['duration_ms'];
                    $valid++;
                    $dropped += count($r['dropped']);
                    $f = $r['fields'];
                    $filled += (int) ($f['doc_type'] !== null) + (int) ($f['doc_date'] !== null) + (int) ($f['title'] !== null);
                    $s = $r['stats'];
                    $this->line(sprintf('  doc %d : %.1f s (lecture %d tok/%.1f s, réponse %d tok/%.1f s) — %s | %s | %s | ref %s%s',
                        $doc->id, $r['duration_ms'] / 1000, $s['prompt_tokens'], $s['prompt_s'], $s['output_tokens'], $s['output_s'],
                        $f['doc_type'] ?? '—', $f['doc_date']?->format('Y-m-d') ?? '—',
                        mb_substr($f['title'] ?? '—', 0, 50), $f['reference_number'] ?? '—',
                        $r['dropped'] ? ' | écarté : '.implode(', ', $r['dropped']) : ''));
                    if ($this->option('show')) {
                        $this->line('    '.$r['raw']);
                    }
                } catch (ExtractionFailed $e) {
                    $this->warn("  doc {$doc->id} : JSON invalide");
                }
            }
            $avg = $times ? array_sum($times) / count($times) / 1000 : null;
            $rows[] = [
                $model,
                $avg ? number_format($avg, 1).' s' : '—',
                $avg ? number_format(86400 / $avg).' / jour' : '—',
                "{$valid}/{$docs->count()}",
                $filled.' / '.($docs->count() * 3),
                $dropped,
            ];
        }

        $this->table(['Modèle', 'Temps / document', 'Débit (1 worker)', 'JSON valide', 'Champs remplis (type, date, titre)', 'Valeurs inventées écartées'], $rows);

        return self::SUCCESS;
    }
}
