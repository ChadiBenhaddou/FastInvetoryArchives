<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('devices', function (Blueprint $table) {
            $table->id();
            $table->char('letter', 1)->unique();
            $table->string('label');
            // Highest box sequence received from this phone; used to detect gaps and reuse.
            $table->unsignedSmallInteger('last_sequence_seen')->default(0);
            // PIN the admin types on the phone to unlock its settings (stored encrypted).
            $table->text('admin_pin')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('devices');
    }
};
