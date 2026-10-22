<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('devices', function (Blueprint $table) {
            // Highest counter value the phone reported (it may include boxes not received yet).
            $table->unsignedSmallInteger('last_sequence_issued')->default(0)->after('last_sequence_seen');
            // Boxes still open on the phone at its last export: not gaps.
            $table->json('open_sequences')->nullable()->after('last_sequence_issued');
        });

        Schema::table('imports', function (Blueprint $table) {
            // Where the ZIP ended up (imported/ or failed/ folder).
            $table->string('archived_path')->nullable()->after('file_size');
            $table->timestamp('started_at')->nullable()->after('imported_by');
        });

        // Codes issued then cancelled on a phone: not counted as gaps.
        Schema::create('voided_sequences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('sequence');
            $table->foreignId('import_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['device_id', 'sequence']);
        });

        // Same box code received again with different photos: kept aside for an admin.
        Schema::create('box_conflicts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('import_id')->constrained()->cascadeOnDelete();
            $table->foreignId('device_id')->constrained();
            $table->string('code', 10)->index();
            $table->foreignId('existing_box_id')->nullable()->constrained('boxes')->nullOnDelete();
            $table->json('incoming');           // the box entry from the manifest
            $table->string('incoming_path');    // folder on the archive disk holding its photos
            $table->string('status', 20)->default('pending')->index();
            $table->string('resolution', 30)->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });

        // Resumable browser uploads (ZIPs are sent in chunks).
        Schema::create('upload_sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('file_name');
            $table->unsignedBigInteger('size');
            $table->unsignedBigInteger('received')->default(0);
            $table->foreignId('import_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('upload_sessions');
        Schema::dropIfExists('box_conflicts');
        Schema::dropIfExists('voided_sequences');
        Schema::table('imports', fn (Blueprint $table) => $table->dropColumn(['archived_path', 'started_at']));
        Schema::table('devices', fn (Blueprint $table) => $table->dropColumn(['last_sequence_issued', 'open_sequences']));
    }
};
