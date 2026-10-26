<?php

namespace App\Console\Commands;

use App\Enums\BoxStatus;
use App\Enums\ImportStatus;
use App\Jobs\ImportExportJob;
use App\Models\Box;
use App\Models\Device;
use App\Models\Document;
use App\Models\Import;
use App\Services\Import\ImportFolders;
use App\Services\Ocr\FallbackOcrService;
use App\Services\Ocr\OcrService;
use App\Services\Search\SearchIndex;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * End-to-end check of an installed system, used by the verify script (run with the network
 * adapter disabled): services up, then a sample export goes through import → OCR → fields
 * (rules, or the LLM when enabled) → search. Every trace of the test (boxes, photos, index entries, device) is removed after.
 */
#[Signature('archive:selftest {zip : Sample export ZIP (built with the bundle)} {--query=* : Words the search must find in the sample} {--timeout=1800 : Seconds to wait for the processing} {--keep : Do not delete the test data}')]
#[Description('Verify the installation end to end with a sample export, then clean up')]
class SelfTest extends Command
{
    private array $failures = [];

    public function handle(OcrService $ocr, SearchIndex $search, ImportFolders $folders): int
    {
        $this->line('1) Services');
        $this->check('Base de données', fn () => DB::select('select 1'));
        $this->check('Moteur de recherche', fn () => Http::timeout(5)->get(rtrim(config('archive.meilisearch.host'), '/').'/health')->throw());
        $this->check('OCR ('.$ocr->name().')', fn () => $ocr->healthy() ?: throw new \RuntimeException('non prêt'));
        if ($ocr instanceof FallbackOcrService && ! $ocr->preferred()->healthy()) {
            // Not a failure (PaddleOCR takes over), but the better engine should be running on Windows.
            $this->warn('   ! OCR Windows (Snipping Tool) indisponible : PaddleOCR est utilisé. Voir windows-ocr\\setup.ps1.');
        }
        $llm = config('archive.llm.enabled');
        if ($llm) {
            $this->check('IA locale + modèle '.config('archive.llm.model'), function () {
                $models = Http::timeout(5)->get(rtrim(config('archive.llm.url'), '/').'/api/tags')->throw()->json('models.*.name') ?? [];
                in_array(config('archive.llm.model'), $models, true) ?: throw new \RuntimeException('modèle absent');
            });
        }
        $this->check('Dossier des archives accessible en écriture', fn () => is_writable(config('archive.root')) ?: throw new \RuntimeException(config('archive.root')));
        if ($this->failures) {
            return $this->finish();
        }

        $zip = $this->argument('zip');
        $za = new \ZipArchive;
        if ($za->open($zip) !== true) {
            $this->failures[] = "ZIP d'exemple illisible : {$zip}";

            return $this->finish();
        }
        $manifest = json_decode($za->getFromName('manifest.json'), true);
        $za->close();
        $letter = $manifest['device_letter'];
        $codes = array_column($manifest['boxes'], 'code');
        if (Box::whereIn('code', $codes)->exists()) {
            $this->failures[] = 'Les codes de test ('.implode(', ', $codes).') existent déjà : test impossible sans risque.';

            return $this->finish();
        }

        $createdDevice = null;
        $device = Device::where('letter', $letter)->first();
        if (! $device) {
            $createdDevice = $device = Device::create(['letter' => $letter, 'label' => 'Test de vérification (temporaire)']);
        }
        $deviceState = $device->only(['last_sequence_seen', 'last_sequence_issued', 'open_sequences', 'is_active']);
        $device->update(['is_active' => true]);

        $import = null;
        try {
            $this->line('2) Import de l\'export d\'exemple');
            $copy = $folders->adopt($this->copyToTemp($zip), 'selftest.zip');
            $import = Import::create(['file_name' => 'selftest.zip', 'source' => 'upload', 'status' => ImportStatus::Pending]);
            ImportExportJob::dispatchSync($import->id, $copy);
            $import->refresh();
            $this->check("Import ({$import->box_count} boîte(s), {$import->photo_count} photo(s))",
                fn () => $import->status === ImportStatus::Completed ?: throw new \RuntimeException($import->status->value.' '.json_encode($import->report['fatal'] ?? $import->report['errors'] ?? '')));

            $this->line($llm
                ? '3) Traitement (OCR → extraction IA → indexation), peut prendre plusieurs minutes…'
                : '3) Traitement (OCR + extraction par règles → indexation)…');
            $started = microtime(true);
            $deadline = time() + (int) $this->option('timeout');
            $boxes = Box::whereIn('code', $codes);
            while (time() < $deadline && (clone $boxes)->where('status', '!=', BoxStatus::Done)->exists()) {
                usleep(500_000);
                $this->output->write('.');
            }
            $this->newLine();
            $seconds = microtime(true) - $started;
            $this->check(sprintf('Boîtes traitées en %.1f s (%.1f s par photo)', $seconds, $seconds / max(1, $import->photo_count)),
                fn () => ! (clone $boxes)->where('status', '!=', BoxStatus::Done)->exists() ?: throw new \RuntimeException('délai dépassé'));

            $docs = Document::whereIn('box_id', (clone $boxes)->pluck('id'))->get();
            $this->check('Texte lu par l\'OCR ('.$docs->pluck('ocr_engine')->unique()->implode(', ').')', fn () => $docs->every(fn ($d) => trim((string) $d->ocr_text) !== '') ?: throw new \RuntimeException('page sans texte'));
            $this->check($llm ? 'Champs extraits par l\'IA' : 'Champs extraits par règles', fn () => $docs->where('extraction_status', 'done')->count() === $docs->count() ?: throw new \RuntimeException($docs->pluck('extraction_status')->implode(',')));
            foreach ($this->option('query') as $query) {
                $this->check("Recherche « {$query} »", function () use ($search, $query, $codes) {
                    for ($i = 0; $i < 10; $i++) { // indexing is asynchronous in Meilisearch
                        $hits = $search->search($query, ['filter' => ['box_code IN ['.implode(',', array_map(fn ($c) => "\"{$c}\"", $codes)).']']])['hits'];
                        if ($hits) {
                            return;
                        }
                        sleep(1);
                    }
                    throw new \RuntimeException('aucun résultat');
                });
            }
        } catch (Throwable $e) {
            $this->failures[] = 'Erreur : '.$e->getMessage();
        } finally {
            if (! $this->option('keep')) {
                $this->cleanup($codes, $import, $createdDevice, $device, $deviceState, $search);
            }
        }

        return $this->finish();
    }

    private function check(string $label, callable $probe): void
    {
        try {
            $probe();
            $this->line("   <info>✓</info> {$label}");
        } catch (Throwable $e) {
            $this->line("   <error>✗</error> {$label} : {$e->getMessage()}");
            $this->failures[] = $label;
        }
    }

    private function copyToTemp(string $zip): string
    {
        $tmp = storage_path('app/selftest-'.uniqid().'.zip');
        File::copy($zip, $tmp);

        return $tmp;
    }

    private function cleanup(array $codes, ?Import $import, ?Device $created, Device $device, array $state, SearchIndex $search): void
    {
        $this->line('4) Nettoyage des données de test');
        $boxes = Box::whereIn('code', $codes)->get();
        $docIds = Document::whereIn('box_id', $boxes->pluck('id'))->pluck('id')->all();
        try {
            $docIds && $search->delete(...$docIds);
        } catch (Throwable) {
        }
        foreach ($boxes as $box) {
            Storage::disk('archive')->deleteDirectory($box->code);
            $box->images()->delete();
            $box->delete();
        }
        if ($import) {
            if ($import->archived_path && is_file($import->archived_path)) {
                @unlink($import->archived_path);
            }
            $import->delete();
        }
        $created ? $created->delete() : $device->forceFill($state)->save();
        $this->line('   données de test supprimées');
    }

    private function finish(): int
    {
        if ($this->failures) {
            $this->error('VÉRIFICATION ÉCHOUÉE : '.implode(' ; ', $this->failures));

            return self::FAILURE;
        }
        $this->info('VÉRIFICATION RÉUSSIE');

        return self::SUCCESS;
    }
}
