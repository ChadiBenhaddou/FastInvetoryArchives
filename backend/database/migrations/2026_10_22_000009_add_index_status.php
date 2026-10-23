<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            // pending | done | failed — so a search-engine outage never blocks a box forever.
            $table->string('index_status', 20)->default('pending')->after('indexed_at')->index();
            $table->string('extraction_model', 100)->nullable()->after('extraction_status');
            $table->index('extraction_status');
        });
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropIndex(['extraction_status']);
            $table->dropColumn(['index_status', 'extraction_model']);
        });
    }
};
