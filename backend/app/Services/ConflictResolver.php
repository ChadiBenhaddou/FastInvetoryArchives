<?php

namespace App\Services;

use App\Enums\BoxStatus;
use App\Enums\ImageType;
use App\Enums\OcrStatus;
use App\Events\BoxImported;
use App\Exceptions\InvalidBoxCode;
use App\Models\AuditLog;
use App\Models\Box;
use App\Models\BoxConflict;
use App\Models\Device;
use App\Models\Image;
use App\Models\User;
use App\Services\Search\SearchIndex;
use App\Support\BoxCode;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * A box code arrived again with different photos (see ExportImporter). The admin decides:
 *  - keep_existing: the incoming photos were a duplicate/mistake → discarded;
 *  - new_box:       the incoming photos are another box whose code was miswritten → new box
 *                   with the corrected code;
 *  - replace:       the incoming photos are the right ones → they replace the box's photos
 *                   (the old ones are kept aside in _replaced/, never deleted).
 */
class ConflictResolver
{
    public function __construct(private readonly SearchIndex $search) {}

    public function resolve(BoxConflict $conflict, string $action, User $user, ?string $newCode = null): BoxConflict
    {
        if ($conflict->status !== 'pending') {
            throw ValidationException::withMessages(['action' => 'Ce conflit a déjà été traité.']);
        }

        $box = match ($action) {
            'keep_existing' => $this->keepExisting($conflict),
            'new_box' => $this->newBox($conflict, (string) $newCode),
            'replace' => $this->replace($conflict),
            default => throw ValidationException::withMessages(['action' => 'Action inconnue.']),
        };

        $conflict->update(['status' => 'resolved', 'resolution' => $action, 'resolved_by' => $user->id, 'resolved_at' => now()]);
        AuditLog::record("conflict_{$action}", $conflict, null, ['code' => $conflict->code, 'box' => $box?->code]);
        if ($box) {
            BoxImported::dispatch($box->id); // OCR → extraction → indexing for the new photos
        }

        return $conflict;
    }

    private function keepExisting(BoxConflict $conflict): ?Box
    {
        Storage::disk('archive')->deleteDirectory($conflict->incoming_path);

        return null;
    }

    private function newBox(BoxConflict $conflict, string $input): Box
    {
        try {
            $code = BoxCode::parse($input);
        } catch (InvalidBoxCode $e) {
            throw ValidationException::withMessages(['code' => $e->getMessage()]);
        }
        if (Box::where('code', $code->value())->exists()) {
            throw ValidationException::withMessages(['code' => "Le code {$code->value()} est déjà utilisé."]);
        }
        $device = Device::where('letter', $code->device)->first()
            ?? throw ValidationException::withMessages(['code' => "Aucun appareil n'utilise la lettre {$code->device}."]);

        $data = $conflict->incoming;

        return DB::transaction(function () use ($conflict, $code, $device, $data) {
            $box = Box::create([
                'code' => $code->value(),
                'device_id' => $device->id,
                'sequence' => $code->sequence,
                'import_id' => $conflict->import_id,
                'agent_name' => $conflict->import?->agent_name,
                'room' => $data['location']['room'] ?? null,
                'shelf' => $data['location']['shelf'] ?? null,
                'row' => $data['location']['row'] ?? null,
                'status' => BoxStatus::Imported,
                'photo_count' => count($data['photos']),
                'created_on_phone_at' => Carbon::parse($data['created_at']),
                'closed_at' => Carbon::parse($data['closed_at']),
            ]);
            $this->attachIncomingPhotos($box, $conflict);

            return $box;
        });
    }

    private function replace(BoxConflict $conflict): Box
    {
        $box = $conflict->existingBox ?? throw ValidationException::withMessages(['action' => 'La boîte existante a disparu.']);
        $disk = Storage::disk('archive');

        return DB::transaction(function () use ($box, $conflict, $disk) {
            $ids = $box->documents()->pluck('id')->all();
            if ($ids) {
                try {
                    $this->search->delete(...$ids);
                } catch (Throwable) {
                    // the index is rebuilt by the new processing anyway
                }
            }
            $box->images()->delete(); // documents cascade
            $keep = '_replaced/'.$box->code.'-'.now()->format('Ymd_His');
            $disk->makeDirectory('_replaced');
            if ($disk->exists($box->code)) {
                rename($disk->path($box->code), $disk->path($keep));
            }
            $box->update(['status' => BoxStatus::Imported, 'photo_count' => count($conflict->incoming['photos'])]);
            $this->attachIncomingPhotos($box->fresh(), $conflict);

            return $box;
        });
    }

    /** Moves the photos kept in _conflicts/ into the box folder and creates their records. */
    private function attachIncomingPhotos(Box $box, BoxConflict $conflict): void
    {
        $disk = Storage::disk('archive');
        foreach ($conflict->incoming['photos'] as $photo) {
            $from = sprintf('%s/%03d.jpg', $conflict->incoming_path, $photo['sequence']);
            $to = sprintf('%s/%03d.jpg', $box->code, $photo['sequence']);
            $disk->delete($to);
            $disk->move($from, $to);
            $type = ImageType::from($photo['type']);
            Image::create([
                'box_id' => $box->id,
                'sequence' => $photo['sequence'],
                'type' => $type,
                'path' => $to,
                'original_name' => $photo['file'],
                'checksum' => $photo['sha256'],
                'file_size' => $disk->size($to),
                'width' => $photo['width'],
                'height' => $photo['height'],
                'quality_score' => $photo['quality']['sharpness'] ?? null,
                'ocr_status' => $type === ImageType::CodePhoto ? OcrStatus::Skipped : OcrStatus::Pending,
                'taken_at' => Carbon::parse($photo['taken_at']),
            ]);
        }
        $disk->deleteDirectory($conflict->incoming_path);
    }
}
