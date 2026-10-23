<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BackupController;
use App\Http\Controllers\BoxController;
use App\Http\Controllers\ConflictController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DeviceController;
use App\Http\Controllers\ExportController;
use App\Http\Controllers\ImageController;
use App\Http\Controllers\ImportController;
use App\Http\Controllers\ReviewController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\SystemController;
use App\Http\Controllers\UploadController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

/*
| JSON API for the desktop UI. It lives in the "web" group on purpose: the UI is
| served from the same origin, so it uses the session cookie + CSRF protection.
*/
Route::prefix('api')->group(function () {
    Route::post('auth/login', [AuthController::class, 'login']);
    Route::get('auth/me', [AuthController::class, 'me']);

    Route::middleware(['auth', 'active'])->group(function () {
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('system/status', [SystemController::class, 'status']);
        Route::get('pipeline/status', [SystemController::class, 'pipeline']);
        Route::get('dashboard', DashboardController::class);

        // Import: daily operator work, open to admins and reviewers (every import records who did it).
        Route::post('uploads', [UploadController::class, 'store'])->name('uploads.store');
        Route::put('uploads/{upload}', [UploadController::class, 'update'])->name('uploads.update');
        Route::post('uploads/{upload}/complete', [UploadController::class, 'complete'])->name('uploads.complete');
        Route::get('imports', [ImportController::class, 'index'])->name('imports.index');
        Route::get('imports/{import}', [ImportController::class, 'show'])->name('imports.show');
        Route::get('devices', [DeviceController::class, 'index'])->name('devices.index');

        // Boxes, photos, review, search.
        Route::get('boxes', [BoxController::class, 'index']);
        Route::get('boxes/filters', [BoxController::class, 'filters']);
        Route::get('boxes/{box}', [BoxController::class, 'show']);
        Route::post('boxes/{box}/approve', [BoxController::class, 'approve']);
        Route::get('images/{image}', [ImageController::class, 'show']);
        Route::get('images/{image}/thumb', [ImageController::class, 'thumb']);
        Route::get('review/next', [ReviewController::class, 'next']);
        Route::put('documents/{document}', [ReviewController::class, 'updateDocument']);
        Route::get('search', SearchController::class);

        Route::middleware('role:admin')->group(function () {
            Route::apiResource('users', UserController::class)->only(['index', 'store', 'update']);
            Route::post('devices', [DeviceController::class, 'store'])->name('devices.store');
            Route::put('devices/{device}', [DeviceController::class, 'update'])->name('devices.update');
            Route::post('devices/{device}/pin', [DeviceController::class, 'generatePin']);
            Route::get('devices/{device}/pin', [DeviceController::class, 'revealPin']);

            Route::put('boxes/{box}/code', [BoxController::class, 'updateCode']);
            Route::get('conflicts', [ConflictController::class, 'index']);
            Route::get('conflicts/{conflict}', [ConflictController::class, 'show']);
            Route::get('conflicts/{conflict}/photos/{sequence}', [ConflictController::class, 'photo'])->whereNumber('sequence');
            Route::post('conflicts/{conflict}/resolve', [ConflictController::class, 'resolve']);

            Route::get('export', ExportController::class);
            Route::get('backups', [BackupController::class, 'index']);
            Route::post('backups', [BackupController::class, 'store']);
        });
    });

    Route::fallback(fn () => response()->json(['message' => 'Route introuvable.'], 404));
});

// Every other URL is handled by the React app (client-side routing).
Route::view('/{path?}', 'app')->where('path', '^(?!api/|up$).*$')->name('spa');
