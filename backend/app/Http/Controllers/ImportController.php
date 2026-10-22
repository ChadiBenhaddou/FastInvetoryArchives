<?php

namespace App\Http\Controllers;

use App\Http\Resources\ImportResource;
use App\Models\Import;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ImportController extends Controller
{
    /** Import history, most recent first. ?ids=1,2,3 returns just those (progress polling). */
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = Import::with(['device', 'importer'])->latest('id');

        if ($request->filled('ids')) {
            $ids = array_filter(array_map('intval', explode(',', $request->string('ids'))));

            return ImportResource::collection($query->whereIn('id', $ids)->get());
        }
        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        return ImportResource::collection($query->paginate(25));
    }

    public function show(Import $import): ImportResource
    {
        return new ImportResource($import->load(['device', 'importer']));
    }
}
