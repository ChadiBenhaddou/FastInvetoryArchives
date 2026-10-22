<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('imports', function (Blueprint $table) {
            $table->id();
            // From manifest.json; null when the ZIP was unreadable.
            $table->uuid('export_id')->nullable()->unique();
            $table->foreignId('device_id')->nullable()->constrained()->nullOnDelete();
            $table->string('agent_name')->nullable();
            $table->string('file_name');
            $table->unsignedBigInteger('file_size')->default(0);
            $table->string('source', 20)->default('upload'); // upload | watched_folder
            $table->string('app_version', 30)->nullable();
            $table->timestamp('exported_at')->nullable();
            $table->unsignedSmallInteger('sequence_from')->nullable();
            $table->unsignedSmallInteger('sequence_to')->nullable();
            $table->unsignedInteger('box_count')->default(0);
            $table->unsignedInteger('photo_count')->default(0);
            $table->string('status', 30)->default('pending')->index();
            $table->json('report')->nullable();
            $table->foreignId('imported_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('imported_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('imports');
    }
};
