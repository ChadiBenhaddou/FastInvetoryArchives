<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            // Why the document needs a human look: ["low_ocr_confidence", "handwritten", ...]
            $table->json('review_reasons')->nullable()->after('needs_review');
            $table->string('ocr_engine', 20)->nullable()->after('is_handwritten');
        });
    }

    public function down(): void
    {
        Schema::table('documents', fn (Blueprint $table) => $table->dropColumn(['review_reasons', 'ocr_engine']));
    }
};
