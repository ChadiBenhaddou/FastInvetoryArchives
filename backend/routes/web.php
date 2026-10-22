<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\SystemController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

/*
| JSON API for the desktop UI. It lives in the "web" group on purpose: the UI is
| served from the same origin, so it uses the session cookie + CSRF protection.
*/
Route::prefix('api')->group(function () {
    Route::post('auth/login', [AuthController::class, 'login']);

    Route::middleware(['auth', 'active'])->group(function () {
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::get('system/status', [SystemController::class, 'status']);

        Route::middleware('role:admin')->group(function () {
            Route::apiResource('users', UserController::class)->only(['index', 'store', 'update']);
        });
    });

    Route::fallback(fn () => response()->json(['message' => 'Route introuvable.'], 404));
});

// Every other URL is handled by the React app (client-side routing).
Route::view('/{path?}', 'app')->where('path', '^(?!api/|up$).*$')->name('spa');
