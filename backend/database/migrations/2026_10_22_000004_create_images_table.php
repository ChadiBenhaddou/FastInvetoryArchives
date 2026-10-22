<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('images', function (Blueprint $table) {
            $table->id();
            $table->foreignId('box_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('sequence');
            $table->string('type', 20)->default('document');
            // Relative to the "archive" disk: {box_code}/{sequence}.jpg
            $table->string('path');
            $table->string('original_name')->nullable();
            $table->char('checksum', 64)->index(); // SHA-256
            $table->unsignedInteger('file_size')->default(0);
            $table->unsignedSmallInteger('width')->nullable();
            $table->unsignedSmallInteger('height')->nullable();
            $table->float('quality_score')->nullable();
            $table->string('ocr_status', 20)->default('pending')->index();
            $table->timestamp('taken_at')->nullable();
            $table->timestamps();

            $table->unique(['box_id', 'sequence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('images');
    }
};
