<?php

namespace App\Http\Controllers;

use App\Http\Resources\DeviceResource;
use App\Models\AuditLog;
use App\Models\Device;
use Illuminate\Http\JsonResponse;
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

    /**
     * Generates a new admin PIN for the phone (typed once in the phone's setup screen).
     * Stored encrypted so an admin can look it up later; every reveal is audited.
     */
    public function generatePin(Device $device): JsonResponse
    {
        $pin = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $device->forceFill(['admin_pin' => $pin])->saveQuietly();
        AuditLog::record('pin_generated', $device);

        return response()->json(['pin' => $pin]);
    }

    public function revealPin(Device $device): JsonResponse
    {
        abort_unless($device->admin_pin, 404, 'Aucun code PIN généré pour cet appareil.');
        AuditLog::record('pin_revealed', $device);

        return response()->json(['pin' => $device->admin_pin]);
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
