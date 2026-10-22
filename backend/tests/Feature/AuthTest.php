<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_log_in_with_username_and_password(): void
    {
        $user = User::factory()->create(['username' => 'amina']);

        $this->postJson('/api/auth/login', ['username' => 'amina', 'password' => 'password'])
            ->assertOk()
            ->assertJsonPath('data.username', 'amina')
            ->assertJsonPath('data.role', 'reviewer');

        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($user->fresh()->last_login_at);
        $this->assertDatabaseHas('audit_logs', ['user_id' => $user->id, 'action' => 'login']);
    }

    public function test_wrong_password_is_rejected(): void
    {
        User::factory()->create(['username' => 'amina']);

        $this->postJson('/api/auth/login', ['username' => 'amina', 'password' => 'wrong'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('username');

        $this->assertGuest();
    }

    public function test_inactive_user_cannot_log_in(): void
    {
        User::factory()->inactive()->create(['username' => 'old']);

        $this->postJson('/api/auth/login', ['username' => 'old', 'password' => 'password'])
            ->assertStatus(422);

        $this->assertGuest();
    }

    public function test_login_is_throttled_after_five_failures(): void
    {
        User::factory()->create(['username' => 'amina']);

        foreach (range(1, 5) as $_) {
            $this->postJson('/api/auth/login', ['username' => 'amina', 'password' => 'wrong']);
        }

        $this->postJson('/api/auth/login', ['username' => 'amina', 'password' => 'password'])
            ->assertStatus(422)
            ->assertJsonPath('errors.username.0', fn ($msg) => str_starts_with($msg, 'Trop de tentatives'));

        $this->assertGuest();
    }

    public function test_api_requires_authentication(): void
    {
        $this->getJson('/api/system/status')->assertUnauthorized();
        $this->getJson('/api/imports')->assertUnauthorized();
        $this->postJson('/api/uploads', ['file_name' => 'a.zip', 'size' => 1])->assertUnauthorized();
        // "Who am I?" answers null instead of 401 (asked by the login page on every load).
        $this->getJson('/api/auth/me')->assertOk()->assertExactJson(['data' => null]);
    }

    public function test_deactivated_user_is_logged_out_on_next_request(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $user->update(['is_active' => false]);

        $this->getJson('/api/system/status')->assertUnauthorized();
        $this->getJson('/api/auth/me')->assertExactJson(['data' => null]);
    }

    public function test_logout(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/auth/logout')->assertOk();

        $this->assertGuest();
        $this->assertSame(1, AuditLog::where('action', 'logout')->count());
    }

    public function test_spa_is_served_for_client_side_routes(): void
    {
        $this->withoutVite();

        $this->get('/')->assertOk()->assertSee('id="root"', false);
        $this->get('/login')->assertOk();
        $this->get('/boxes/A-0123-N')->assertOk();
    }

    public function test_unknown_api_route_returns_json_404(): void
    {
        $this->getJson('/api/nope')->assertNotFound()->assertJsonPath('message', 'Route introuvable.');
    }
}
