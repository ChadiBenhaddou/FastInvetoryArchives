<?php

namespace App\Services;

use App\Models\Box;
use App\Models\Device;
use App\Models\VoidedSequence;
use App\Support\BoxCode;

/**
 * Box numbers issued by a phone but never received on the PC.
 * Voided codes and boxes still open on the phone are not gaps.
 */
class SequenceGaps
{
    /**
     * @return array<int, array{from: int, to: int, count: int, first_code: string, last_code: string}>
     */
    public function forDevice(Device $device): array
    {
        $max = max($device->last_sequence_issued, $device->last_sequence_seen);
        if ($max < 1) {
            return [];
        }

        $known = array_flip(array_merge(
            Box::where('device_id', $device->id)->pluck('sequence')->all(),
            VoidedSequence::where('device_id', $device->id)->pluck('sequence')->all(),
            $device->open_sequences ?? [],
        ));

        $gaps = [];
        $start = null;
        for ($seq = 1; $seq <= $max + 1; $seq++) {
            $missing = $seq <= $max && ! isset($known[$seq]);
            if ($missing && $start === null) {
                $start = $seq;
            } elseif (! $missing && $start !== null) {
                $end = $seq - 1;
                $gaps[] = [
                    'from' => $start,
                    'to' => $end,
                    'count' => $end - $start + 1,
                    'first_code' => BoxCode::make($device->letter, $start)->value(),
                    'last_code' => BoxCode::make($device->letter, $end)->value(),
                ];
                $start = null;
            }
        }

        return $gaps;
    }
}
