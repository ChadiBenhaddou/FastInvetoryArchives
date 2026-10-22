<?php

namespace App\Http\Controllers;

use App\Http\Resources\DeviceResource;
use App\Models\Device;
use App\Support\BoxCode;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/**
 * Phones and their letters. The admin PIN generation comes with the full device page
 * (deliverable 6); registering a letter is needed now because imports require it.
 */
class DeviceController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        return DeviceResource::collection(Device::withCount('boxes')->orderBy('letter')->get());
    }

    public function store(Request $request): DeviceResource
    {
        $data = $request->validate([
            'letter' => ['required', 'string', 'size:1', Rule::in(str_split(BoxCode::ALPHABET)), 'unique:devices,letter'],
            'label' => ['required', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ], ['letter.in' => 'Lettre non autorisée (les lettres O, I, S, B, Z sont exclues).']);

        return new DeviceResource(Device::create($data)->loadCount('boxes'));
    }

    public function update(Request $request, Device $device): DeviceResource
    {
        $data = $request->validate([
            'label' => ['sometimes', 'required', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        $device->update($data);

        return new DeviceResource($device->loadCount('boxes'));
    }
}
