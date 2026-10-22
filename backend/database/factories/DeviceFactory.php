<?php

namespace Database\Factories;

use App\Models\Device;
use App\Support\BoxCode;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Device>
 */
class DeviceFactory extends Factory
{
    public function definition(): array
    {
        return [
            'letter' => fake()->unique()->randomElement(str_split(BoxCode::ALPHABET)),
            'label' => 'Téléphone '.fake()->numberBetween(1, 99),
            'last_sequence_seen' => 0,
            'is_active' => true,
        ];
    }
}
