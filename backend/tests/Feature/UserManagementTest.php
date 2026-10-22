<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UserManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_reviewer_cannot_manage_users(): void
    {
        $this->actingAs(User::factory()->create())
            ->getJson('/api/users')
            ->assertForbidden();
    }

    public function test_admin_creates_a_user_and_it_is_audited(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->postJson('/api/users', [
            'name' => 'Youssef',
            'username' => 'youssef',
            'password' => 'motdepasse1',
            'role' => 'reviewer',
        ])->assertCreated()->assertJsonPath('data.username', 'youssef');

        $created = User::where('username', 'youssef')->firstOrFail();
        $this->assertTrue(Hash::check('motdepasse1', $created->password));

        $log = AuditLog::where(['entity' => 'user', 'entity_id' => $created->id, 'action' => 'created'])->firstOrFail();
        $this->assertSame($admin->id, $log->user_id);
        $this->assertArrayNotHasKey('password', $log->after, 'Passwords must never be written to the audit log');
    }

    public function test_update_is_audited_with_before_and_after(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->create(['name' => 'Avant']);

        $this->actingAs($admin)->putJson("/api/users/{$user->id}", ['name' => 'Après'])->assertOk();

        $log = AuditLog::where(['entity' => 'user', 'entity_id' => $user->id, 'action' => 'updated'])->firstOrFail();
        $this->assertSame(['name' => 'Avant'], $log->before);
        $this->assertSame(['name' => 'Après'], $log->after);
    }

    public function test_admin_cannot_lock_themselves_out(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->putJson("/api/users/{$admin->id}", ['is_active' => false])->assertStatus(422);
        $this->actingAs($admin)->putJson("/api/users/{$admin->id}", ['role' => 'reviewer'])->assertStatus(422);

        $this->assertTrue($admin->fresh()->isAdmin());
    }

    public function test_usernames_are_unique(): void
    {
        $admin = User::factory()->admin()->create(['username' => 'admin']);

        $this->actingAs($admin)->postJson('/api/users', [
            'name' => 'X', 'username' => 'admin', 'password' => 'motdepasse1', 'role' => 'reviewer',
        ])->assertStatus(422)->assertJsonValidationErrors('username');
    }

    public function test_create_admin_command(): void
    {
        $this->artisan('archive:create-admin', ['--username' => 'chef', '--password' => 'motdepasse1'])
            ->assertSuccessful();

        $this->assertTrue(User::where('username', 'chef')->firstOrFail()->isAdmin());

        // Running it again resets the password instead of failing.
        $this->artisan('archive:create-admin', ['--username' => 'chef', '--password' => 'nouveaumdp2'])
            ->assertSuccessful();
        $this->assertTrue(Hash::check('nouveaumdp2', User::where('username', 'chef')->first()->password));

        $this->artisan('archive:create-admin', ['--username' => 'chef', '--password' => 'court'])
            ->assertFailed();
    }
}
