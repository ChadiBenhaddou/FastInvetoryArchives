<?php

namespace App\Services;

use App\Exceptions\InvalidBoxCode;
use App\Jobs\IndexDocumentJob;
use App\Models\AuditLog;
use App\Models\Box;
use App\Models\Device;
use App\Models\Image;
use App\Support\BoxCode;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Renames a box whose handwritten code does not match (seen on the review screen next to
 * the photo of the code). Photos move to the new folder, the search index follows, and
 * the change is recorded in the audit log.
 */
class BoxCodeCorrector
{
    public function correct(Box $box, string $input): Box
    {
        try {
            $code = BoxCode::parse($input);
        } catch (InvalidBoxCode $e) {
            throw ValidationException::withMessages(['code' => $e->getMessage()]);
        }
        $new = $code->value();
        $old = $box->code;
        if ($new === $old) {
            return $box;
        }
        if (Box::where('code', $new)->exists()) {
            throw ValidationException::withMessages(['code' => "Le code {$new} est déjà utilisé par une autre boîte."]);
        }
        $device = Device::where('letter', $code->device)->first()
            ?? throw ValidationException::withMessages(['code' => "Aucun appareil n'utilise la lettre {$code->device}."]);

        $disk = Storage::disk('archive');
        if ($disk->exists($new)) {
            throw ValidationException::withMessages(['code' => "Un dossier {$new} existe déjà sur le disque des photos."]);
        }
        $moved = $disk->exists($old) && rename($disk->path($old), $disk->path($new));

        try {
            DB::transaction(function () use ($box, $device, $code, $old, $new) {
                $box->update(['code' => $new, 'device_id' => $device->id, 'sequence' => $code->sequence]);
                Image::where('box_id', $box->id)->get()->each(fn (Image $img) => $img->update([
                    'path' => $new.substr($img->path, strlen($old)),
                ]));
                AuditLog::record('code_corrected', $box, ['code' => $old], ['code' => $new]);
            });
        } catch (Throwable $e) {
            if ($moved) {
                rename($disk->path($new), $disk->path($old)); // put the photos back
            }
            throw $e;
        }

        foreach ($box->documents()->pluck('id') as $id) {
            IndexDocumentJob::dispatch($id);
        }

        return $box;
    }
}
