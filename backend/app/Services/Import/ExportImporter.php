<?php

namespace App\Services\Import;

use App\Enums\BoxStatus;
use App\Enums\ImageType;
use App\Enums\ImportStatus;
use App\Enums\OcrStatus;
use App\Events\BoxImported;
use App\Exceptions\InvalidBoxCode;
use App\Models\Box;
use App\Models\BoxConflict;
use App\Models\Device;
use App\Models\Image;
use App\Models\Import;
use App\Models\VoidedSequence;
use App\Services\SequenceGaps;
use App\Support\BoxCode;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;
use ZipArchive;

/**
 * Imports one phone export ZIP:
 *  1. manifest.json read and validated against the shared schema, app version checked;
 *  2. device letter known, export_id not already imported;
 *  3. per box: code + check letter, every photo present with the right SHA-256;
 *  4. new box → photos copied to {code}/{NNN}.jpg + records created;
 *     same code with identical photos → skipped; with different photos → conflict;
 *  5. voided codes, counter and gaps recorded.
 * A problem with one box rejects that box only; the others are imported.
 */
class ExportImporter
{
    public function __construct(
        private readonly ManifestValidator $validator,
        private readonly SequenceGaps $gaps,
    ) {}

    public function run(Import $import, string $zipPath): ImportReport
    {
        $report = new ImportReport;
        $import->update([
            'status' => ImportStatus::Processing,
            'started_at' => now(),
            'file_size' => @filesize($zipPath) ?: 0,
        ]);

        $zip = new ZipArchive;
        $opened = false;
        $lock = null;
        $addedBoxIds = [];

        try {
            if ($zip->open($zipPath, ZipArchive::RDONLY) !== true) {
                throw new ImportFailed('Fichier ZIP illisible ou incomplet (copie interrompue ?).');
            }
            $opened = true;

            $json = $zip->getFromName('manifest.json');
            if ($json === false) {
                throw new ImportFailed('manifest.json absent : ce ZIP n\'est pas un export de l\'application.');
            }
            $manifest = $this->validator->parse($json);
            $this->checkAppVersion($manifest['app_version']);

            $device = Device::where('letter', $manifest['device_letter'])->first();
            if (! $device) {
                throw new ImportFailed("Appareil « {$manifest['device_letter']} » inconnu : l'enregistrer d'abord dans la page Appareils.");
            }
            if (! $device->is_active) {
                throw new ImportFailed("Appareil « {$device->letter} » désactivé : le réactiver dans la page Appareils pour importer ses exports.");
            }

            $lock = Cache::lock("import:{$manifest['export_id']}", 3700);
            if (! $lock->get()) {
                throw new ImportFailed('Cet export est déjà en cours d\'import.');
            }

            // Shown in the history even when the export turns out to be a duplicate.
            $import->update([
                'device_id' => $device->id,
                'agent_name' => $manifest['agent_name'],
                'app_version' => $manifest['app_version'],
                'exported_at' => Carbon::parse($manifest['exported_at']),
                'sequence_from' => $manifest['sequence_range']['from'],
                'sequence_to' => $manifest['sequence_range']['to'],
            ]);

            if ($this->alreadyImported($import, $manifest['export_id'], $report)) {
                return $this->finish($import, $report, ImportStatus::Duplicate);
            }
            $import->update(['export_id' => $manifest['export_id']]);

            $this->warnAboutExtraFiles($zip, $manifest, $report);

            foreach ($manifest['boxes'] as $boxData) {
                $boxId = $this->importBox($zip, $import, $device, $manifest, $boxData, $report);
                if ($boxId) {
                    $addedBoxIds[] = $boxId;
                }
            }

            $this->recordSequences($import, $device, $manifest, $report);

            $status = $report->hasIssues() ? ImportStatus::CompletedWithIssues : ImportStatus::Completed;

            return $this->finish($import, $report, $status);
        } catch (ImportFailed $e) {
            $report->fatal = $e->getMessage();
            $report->fatalDetails = $e->details;

            return $this->finish($import, $report, ImportStatus::Failed);
        } finally {
            if ($opened) {
                $zip->close();
            }
            Storage::disk('archive')->deleteDirectory("_staging/{$import->id}");
            @rmdir(Storage::disk('archive')->path('_staging')); // only succeeds when empty
            $lock?->release();
            // The processing pipeline starts once the records are committed.
            foreach ($addedBoxIds as $id) {
                BoxImported::dispatch($id);
            }
        }
    }

    private function finish(Import $import, ImportReport $report, ImportStatus $status): ImportReport
    {
        $import->update([
            'status' => $status,
            'report' => $report->toArray(),
            'box_count' => count($report->added),
            'photo_count' => $report->photosAdded(),
            'imported_at' => now(),
        ]);

        return $report;
    }

    private function checkAppVersion(string $version): void
    {
        $major = (int) explode('.', $version)[0];
        if (! in_array($major, config('archive.import.supported_app_majors'), true)) {
            throw new ImportFailed("Version de l'application mobile ({$version}) non prise en charge par ce PC : mettre à jour le PC ou l'application.");
        }
    }

    /**
     * export_id already fully imported → nothing to do. If a previous attempt failed or
     * had issues, this import takes over the export_id and boxes are retried (boxes
     * already imported are skipped as duplicates).
     */
    private function alreadyImported(Import $import, string $exportId, ImportReport $report): bool
    {
        $previous = Import::where('export_id', $exportId)->whereKeyNot($import->id)->first();
        if (! $previous) {
            return false;
        }
        if ($previous->status === ImportStatus::Completed) {
            $report->duplicateOf = $previous->id;
            $report->warnings[] = "Cet export a déjà été importé le {$previous->imported_at?->format('d/m/Y H:i')} (import n° {$previous->id}) : rien n'a été modifié.";

            return true;
        }
        $previous->update(['export_id' => null]);
        $report->warnings[] = "Nouvel essai d'un export déjà traité partiellement (import n° {$previous->id}).";

        return false;
    }

    private function warnAboutExtraFiles(ZipArchive $zip, array $manifest, ImportReport $report): void
    {
        $expected = ['manifest.json' => true];
        foreach ($manifest['boxes'] as $box) {
            foreach ($box['photos'] as $photo) {
                $expected[$photo['file']] = true;
            }
        }
        $extra = 0;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            if (! str_ends_with($name, '/') && ! isset($expected[$name])) {
                $extra++;
            }
        }
        if ($extra) {
            $report->warnings[] = "{$extra} fichier(s) du ZIP non listé(s) dans le manifeste ont été ignorés.";
        }
    }

    /** @return int|null id of the created box */
    private function importBox(ZipArchive $zip, Import $import, Device $device, array $manifest, array $data, ImportReport $report): ?int
    {
        $code = $data['code'];

        try {
            $parsed = BoxCode::parse($code);
        } catch (InvalidBoxCode $e) {
            $report->boxError($code, $e->getMessage());

            return null;
        }
        if ($parsed->device !== $device->letter) {
            $report->boxError($code, "Le code n'appartient pas à l'appareil {$device->letter}.");

            return null;
        }
        if ($parsed->sequence !== $data['sequence']) {
            $report->boxError($code, "Numéro de séquence incohérent ({$data['sequence']}).");

            return null;
        }

        $photos = $data['photos'];
        usort($photos, fn ($a, $b) => $a['sequence'] <=> $b['sequence']);
        if ($problem = $this->photoListProblem($code, $photos)) {
            $report->boxError($code, $problem);

            return null;
        }

        $disk = Storage::disk('archive');
        $staging = "_staging/{$import->id}/{$code}";

        try {
            $files = $this->extractPhotos($zip, $disk, $staging, $photos);
        } catch (ImportFailed $e) {
            $disk->deleteDirectory($staging);
            $report->boxError($code, $e->getMessage());

            return null;
        }

        $existing = Box::where('code', $code)->first();
        if ($existing) {
            $this->handleExisting($existing, $import, $device, $data, $photos, $staging, $report);

            return null;
        }

        try {
            $box = DB::transaction(function () use ($import, $device, $manifest, $data, $code, $photos, $files, $disk) {
                $box = Box::create([
                    'code' => $code,
                    'device_id' => $device->id,
                    'sequence' => $data['sequence'],
                    'import_id' => $import->id,
                    'agent_name' => $manifest['agent_name'],
                    'room' => $data['location']['room'],
                    'shelf' => $data['location']['shelf'],
                    'row' => $data['location']['row'],
                    'status' => BoxStatus::Imported,
                    'photo_count' => count($photos),
                    'created_on_phone_at' => Carbon::parse($data['created_at']),
                    'closed_at' => Carbon::parse($data['closed_at']),
                ]);

                foreach ($photos as $i => $photo) {
                    $path = sprintf('%s/%03d.jpg', $code, $photo['sequence']);
                    $disk->delete($path); // leftover of an earlier interrupted attempt
                    $disk->move($files[$i]['staged'], $path);
                    $type = ImageType::from($photo['type']);
                    Image::create([
                        'box_id' => $box->id,
                        'sequence' => $photo['sequence'],
                        'type' => $type,
                        'path' => $path,
                        'original_name' => $photo['file'],
                        'checksum' => $photo['sha256'],
                        'file_size' => $files[$i]['size'],
                        'width' => $files[$i]['width'],
                        'height' => $files[$i]['height'],
                        'quality_score' => $photo['quality']['sharpness'],
                        // The code photo is checked by a human on the review screen, not OCR'd.
                        'ocr_status' => $type === ImageType::CodePhoto ? OcrStatus::Skipped : OcrStatus::Pending,
                        'taken_at' => Carbon::parse($photo['taken_at']),
                    ]);
                }

                return $box;
            });
        } catch (Throwable $e) {
            $disk->deleteDirectory($staging);
            $disk->deleteDirectory($code);
            $report->boxError($code, 'Erreur lors de l\'enregistrement : '.$e->getMessage());

            return null;
        }

        $disk->deleteDirectory($staging);
        $kept = count(array_filter($photos, fn ($p) => $p['quality']['override']));
        if ($kept) {
            $report->warnings[] = "{$code} : {$kept} photo(s) gardée(s) par l'agent malgré un contrôle qualité négatif.";
        }
        $report->boxAdded($code, count($photos));

        return $box->id;
    }

    /** Photo 0 must be the code photo, then documents, numbered 0..n-1 with the expected file names. */
    private function photoListProblem(string $code, array $photos): ?string
    {
        foreach ($photos as $i => $photo) {
            if ($photo['sequence'] !== $i) {
                return 'Numérotation des photos incohérente (photo '.$i.' manquante).';
            }
            $expectedType = $i === 0 ? 'code_photo' : 'document';
            if ($photo['type'] !== $expectedType) {
                return $i === 0 ? 'La première photo doit être celle du code écrit sur la boîte.' : "Photo {$i} : type inattendu.";
            }
            $expectedFile = sprintf('boxes/%s/%03d%s.jpg', $code, $i, $i === 0 ? '_code' : '');
            if ($photo['file'] !== $expectedFile) {
                return "Photo {$i} : nom de fichier inattendu ({$photo['file']}).";
            }
        }

        return null;
    }

    /**
     * Streams each photo out of the ZIP into a staging folder while computing its SHA-256.
     *
     * @return array<int, array{staged: string, size: int, width: ?int, height: ?int}>
     *
     * @throws ImportFailed
     */
    private function extractPhotos(ZipArchive $zip, Filesystem $disk, string $staging, array $photos): array
    {
        $max = config('archive.import.max_photo_bytes');
        $files = [];
        $disk->makeDirectory($staging);

        foreach ($photos as $photo) {
            $name = $photo['file'];
            $stat = $zip->statName($name);
            if ($stat === false) {
                throw new ImportFailed("Photo manquante dans le ZIP : {$name}.");
            }
            if ($stat['size'] > $max) {
                throw new ImportFailed("Photo anormalement grande : {$name}.");
            }

            $staged = sprintf('%s/%03d.jpg', $staging, $photo['sequence']);
            $in = $zip->getStream($name);
            $out = fopen($disk->path($staged), 'wb');
            if (! $in || ! $out) {
                throw new ImportFailed("Lecture impossible : {$name}.");
            }
            $hash = hash_init('sha256');
            $size = 0;
            while (! feof($in)) {
                $chunk = fread($in, 1 << 20);
                if ($chunk === false) {
                    break;
                }
                $size += strlen($chunk);
                if ($size > $max) {
                    break;
                }
                hash_update($hash, $chunk);
                fwrite($out, $chunk);
            }
            fclose($in);
            fclose($out);

            if ($size !== $stat['size'] || hash_final($hash) !== $photo['sha256']) {
                throw new ImportFailed("Photo corrompue (empreinte SHA-256 différente) : {$name}. Recopier le fichier depuis le téléphone.");
            }
            $info = @getimagesize($disk->path($staged));
            if (! $info || $info[2] !== IMAGETYPE_JPEG) {
                throw new ImportFailed("Ce n'est pas une image JPEG valide : {$name}.");
            }

            $files[] = ['staged' => $staged, 'size' => $size, 'width' => $info[0], 'height' => $info[1]];
        }

        return $files;
    }

    private function handleExisting(Box $existing, Import $import, Device $device, array $data, array $photos, string $staging, ImportReport $report): void
    {
        $disk = Storage::disk('archive');
        $existingChecksums = $existing->images()->orderBy('sequence')->pluck('checksum')->all();
        $incomingChecksums = array_column($photos, 'sha256');

        if ($existingChecksums === $incomingChecksums) {
            $disk->deleteDirectory($staging);
            $report->duplicates[] = $existing->code;

            return;
        }

        // The same conflicting content already waiting for review (same file imported twice).
        $alreadyPending = BoxConflict::where('code', $existing->code)->where('status', 'pending')->get()
            ->contains(fn (BoxConflict $c) => array_column($c->incoming['photos'], 'sha256') === $incomingChecksums);
        if ($alreadyPending) {
            $disk->deleteDirectory($staging);
            $report->duplicates[] = $existing->code;

            return;
        }

        $conflictDir = "_conflicts/{$import->id}/{$existing->code}";
        $disk->deleteDirectory($conflictDir);
        $disk->makeDirectory(dirname($conflictDir));
        rename($disk->path($staging), $disk->path($conflictDir));
        BoxConflict::create([
            'import_id' => $import->id,
            'device_id' => $device->id,
            'code' => $existing->code,
            'existing_box_id' => $existing->id,
            'incoming' => $data,
            'incoming_path' => $conflictDir,
        ]);
        $report->conflict($existing->code, sprintf(
            'Ce code existe déjà avec d\'autres photos (%d photo(s) au PC, %d reçue(s)). Code réutilisé ou mal recopié ? À examiner par un administrateur.',
            count($existingChecksums),
            count($incomingChecksums),
        ));
    }

    private function recordSequences(Import $import, Device $device, array $manifest, ImportReport $report): void
    {
        foreach ($manifest['voided_sequences'] as $sequence) {
            VoidedSequence::firstOrCreate(
                ['device_id' => $device->id, 'sequence' => $sequence],
                ['import_id' => $import->id],
            );
        }
        $report->voided = $manifest['voided_sequences'];

        $lastIssued = $manifest['sequence_range']['last_issued'];
        if ($lastIssued < $device->last_sequence_issued) {
            $report->warnings[] = sprintf(
                'Le compteur du téléphone %s est revenu en arrière (%d alors que le PC a déjà vu %d) : application réinstallée ? Risque de codes réutilisés — régler « Numéro de la prochaine boîte » à %d dans les réglages du téléphone.',
                $device->letter, $lastIssued, $device->last_sequence_issued, $device->last_sequence_issued + 1,
            );
        }

        $maxBox = (int) Box::where('device_id', $device->id)->max('sequence');
        $isLatestExport = $lastIssued >= $device->last_sequence_issued;
        $device->forceFill([
            'last_sequence_seen' => max($device->last_sequence_seen, $maxBox),
            'last_sequence_issued' => max($device->last_sequence_issued, $lastIssued),
            // Only the most recent export knows which boxes are still open on the phone
            // (an older ZIP imported late must not overwrite it).
            'open_sequences' => $isLatestExport ? ($manifest['open_sequences'] ?? []) : $device->open_sequences,
        ])->save();

        $report->gaps = $this->gaps->forDevice($device);
    }
}
