<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('boxes', function (Blueprint $table) {
            $table->id();
            $table->string('code', 10)->unique();
            $table->foreignId('device_id')->constrained();
            // Sequence part of the code, kept separately for gap detection per device.
            $table->unsignedSmallInteger('sequence');
            $table->foreignId('import_id')->nullable()->constrained()->nullOnDelete();
            $table->string('agent_name')->nullable()->index();
            $table->string('room')->nullable()->index();
            $table->string('shelf')->nullable();
            $table->string('row')->nullable();
            $table->string('status', 20)->default('imported')->index();
            $table->unsignedSmallInteger('photo_count')->default(0);
            $table->timestamp('created_on_phone_at')->nullable()->index();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();

            $table->unique(['device_id', 'sequence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('boxes');
    }
};
