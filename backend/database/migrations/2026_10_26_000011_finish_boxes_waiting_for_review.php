<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The human validation step is gone: a box is "done" once its photos are processed. Boxes left
 * waiting for review by the previous version are done too. Their documents keep their flags.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('boxes')->where('status', 'review')->update(['status' => 'done', 'updated_at' => now()]);
    }

    public function down(): void
    {
        // Which boxes were waiting is not kept: nothing to undo.
    }
};
