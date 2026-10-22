<?php

namespace App\Http\Controllers;

use App\Enums\ImportStatus;
use App\Http\Resources\ImportResource;
use App\Jobs\ImportExportJob;
use App\Models\Import;
use App\Models\UploadSession;
use App\Services\Import\ImportFolders;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Resumable chunked upload of export ZIPs from the browser (drag & drop):
 *   POST   /api/uploads               {file_name, size}  → {id, received}
 *   PUT    /api/uploads/{id}          raw chunk, header Upload-Offset
 *   POST   /api/uploads/{id}/complete                     → the queued import
 * A chunk sent at the wrong offset gets 409 + the current offset, so the browser resumes.
 */
class UploadController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'file_name' => ['required', 'string', 'max:255', 'regex:/\.zip$/i'],
            'size' => ['required', 'integer', 'min:1', 'max:'.(64 * 1024 ** 3)],
        ], ['file_name.regex' => 'Seuls les fichiers .zip exportés par l\'application sont acceptés.']);

        $upload = UploadSession::create([...$data, 'user_id' => $request->user()->id]);
        @mkdir(dirname($upload->partPath()), 0775, true);
        touch($upload->partPath());

        return response()->json(['id' => $upload->id, 'received' => 0, 'chunk_bytes' => config('archive.import.chunk_bytes')], 201);
    }

    public function update(Request $request, UploadSession $upload): JsonResponse
    {
        $this->authorizeUpload($request, $upload);
        $offset = (int) $request->header('Upload-Offset', -1);

        if ($offset !== $upload->received) {
            return response()->json(['message' => 'Décalage inattendu.', 'received' => $upload->received], 409);
        }

        $in = $request->getContent(true); // stream: chunks are never loaded whole in memory
        $out = fopen($upload->partPath(), 'cb');
        fseek($out, $offset);
        $written = stream_copy_to_stream($in, $out, config('archive.import.chunk_bytes') + 1);
        ftruncate($out, $offset + $written);
        fclose($in);
        fclose($out);

        if ($offset + $written > $upload->size) {
            return response()->json(['message' => 'Le fichier dépasse la taille annoncée.'], 422);
        }
        $upload->update(['received' => $offset + $written]);

        return response()->json(['received' => $upload->received]);
    }

    public function complete(Request $request, UploadSession $upload, ImportFolders $folders): JsonResponse
    {
        $this->authorizeUpload($request, $upload);
        if ($upload->import_id) {
            return (new ImportResource(Import::findOrFail($upload->import_id)))->response();
        }
        clearstatcache(true, $upload->partPath());
        if ($upload->received !== $upload->size || filesize($upload->partPath()) !== $upload->size) {
            return response()->json(['message' => 'Envoi incomplet.', 'received' => $upload->received], 422);
        }

        $path = $folders->adopt($upload->partPath(), $upload->file_name);
        $import = Import::create([
            'file_name' => $upload->file_name,
            'file_size' => $upload->size,
            'source' => 'upload',
            'status' => ImportStatus::Pending,
            'imported_by' => $request->user()->id,
        ]);
        $upload->update(['import_id' => $import->id]);
        ImportExportJob::dispatch($import->id, $path);

        return (new ImportResource($import))->response()->setStatusCode(201);
    }

    private function authorizeUpload(Request $request, UploadSession $upload): void
    {
        abort_unless($upload->user_id === $request->user()->id, 403);
    }
}
