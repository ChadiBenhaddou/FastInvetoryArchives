<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** One document per photographed file (one per document image). */
    public function up(): void
    {
        Schema::create('documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('box_id')->constrained()->cascadeOnDelete();
            $table->foreignId('image_id')->unique()->constrained()->cascadeOnDelete();

            // OCR
            $table->longText('ocr_text')->nullable();
            $table->json('ocr_blocks')->nullable(); // [{text, bbox, confidence}] for highlighting
            $table->string('language', 10)->nullable(); // ar | fr | mixed
            $table->float('ocr_confidence')->nullable();
            $table->boolean('is_handwritten')->default(false);

            // LLM extraction
            $table->string('extraction_status', 20)->default('pending');
            $table->string('doc_type', 100)->nullable()->index();
            $table->date('doc_date')->nullable()->index();
            $table->string('reference_number')->nullable()->index();
            $table->string('title', 500)->nullable();
            $table->json('persons')->nullable();
            $table->json('organizations')->nullable();
            $table->json('keywords')->nullable();
            $table->text('summary')->nullable();
            $table->float('extraction_confidence')->nullable();

            // Review
            $table->boolean('needs_review')->default(false)->index();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();

            $table->timestamp('indexed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('documents');
    }
};
