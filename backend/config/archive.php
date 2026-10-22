<?php

return [

    // Version shown in the UI and compared against phone export versions.
    'version' => env('APP_VERSION', 'dev'),

    /*
    | Host folder mounted at ARCHIVE_ROOT in the containers:
    |   import/      watched folder (ZIPs dropped here are imported automatically)
    |   processing/  ZIPs being imported (claimed from import/ or uploaded)
    |   imported/    ZIPs successfully imported
    |   failed/      ZIPs that failed, each with an error .txt
    |   storage/     box photos ("archive" disk)
    |   backups/     default backup destination
    */
    'root' => env('ARCHIVE_ROOT', storage_path('app/archive-dev')),
    // The same folder as the user sees it on the host (display only).
    'host_root' => env('ARCHIVE_HOST_PATH', env('ARCHIVE_ROOT', storage_path('app/archive-dev'))),

    'import' => [
        // Contract with the phone app (shared with mobile/, see shared/manifest.schema.json).
        'manifest_schema' => env('MANIFEST_SCHEMA', base_path('../shared/manifest.schema.json')),
        // Phone app major versions this PC version can read.
        'supported_app_majors' => [1],
        // A file in the watched folder must be unchanged for this long before it is picked up
        // (it may still be copying from the phone).
        'stable_seconds' => (int) env('IMPORT_STABLE_SECONDS', 15),
        // Sanity limit per photo inside a ZIP (phones produce ~0.3-1 MB).
        'max_photo_bytes' => 30 * 1024 * 1024,
        'chunk_bytes' => 8 * 1024 * 1024,
    ],

    'ocr' => [
        'url' => env('OCR_URL', 'http://ocr-worker:8000'),
        // A large photo on a busy CPU can take a while; the job timeout is above this.
        'timeout' => (int) env('OCR_TIMEOUT', 300),
    ],

    'pipeline' => [
        // Number of pipeline queue workers running in parallel (used for the time estimate).
        'workers' => (int) env('PIPELINE_WORKERS', 2),
    ],

    // A document goes to human review when any of these is true.
    'review' => [
        'min_ocr_confidence' => 0.6,
        'min_extraction_confidence' => 0.6,
    ],

    'meilisearch' => [
        'host' => env('MEILISEARCH_HOST', 'http://meilisearch:7700'),
        'key' => env('MEILISEARCH_KEY'),
    ],

];
