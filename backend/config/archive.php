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
    |   storage/     box photos ("archive" disk; ARCHIVE_PHOTOS_PATH elsewhere, see below)
    |   backups/     default backup destination
    */
    'root' => env('ARCHIVE_ROOT', storage_path('app/archive-dev')),
    // The same folder as the user sees it on the host (display only).
    'host_root' => env('ARCHIVE_HOST_PATH', env('ARCHIVE_ROOT', storage_path('app/archive-dev'))),
    // Box photos as the user sees them (display only; the "archive" disk of config/filesystems.php
    // reads ARCHIVE_PHOTOS_PATH). The portable Windows mode keeps them in its donnees\ folder, with
    // the database: that one folder is all a second PC needs.
    'host_photos' => env('ARCHIVE_PHOTOS_HOST_PATH', rtrim(env('ARCHIVE_HOST_PATH', env('ARCHIVE_ROOT', storage_path('app/archive-dev'))), '/\\').'/storage'),

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
        // "windows": Snipping Tool OCR on the Windows PC (windows-ocr/), PaddleOCR when it is
        // unavailable. "paddle": PaddleOCR only (Ubuntu PCs, or to compare).
        'engine' => env('OCR_ENGINE', 'windows'),
        'url' => env('OCR_URL', 'http://ocr-worker:8000'),
        // A large photo on a busy CPU can take a while; the job timeout is above this.
        'timeout' => (int) env('OCR_TIMEOUT', 300),
        'windows' => [
            // Through the gateway: the only container that can reach the PC (127.0.0.1:8010).
            'url' => env('OCR_WINDOWS_URL', 'http://gateway:8010'),
            'timeout' => (int) env('OCR_WINDOWS_TIMEOUT', 120),
        ],
    ],

    'pipeline' => [
        // Queue workers running in parallel per step (used for the time estimate).
        'workers' => (int) env('PIPELINE_WORKERS', 2),
        'extract_workers' => (int) env('EXTRACT_WORKERS', 1),
    ],

    // Local LLM (Ollama, internal network only) used to extract metadata from OCR text.
    // Off by default: ~2.5 min per page on the CPU. Fast rules (RuleExtractor) fill the fields
    // instead, and a box is ready for review seconds after its photos are read.
    'llm' => [
        'enabled' => filter_var(env('LLM_ENABLED', false), FILTER_VALIDATE_BOOLEAN),
        'url' => env('OLLAMA_URL', 'http://ollama:11434'),
        'model' => env('LLM_MODEL', 'qwen3:4b-instruct-2507-q4_K_M'),
        'timeout' => (int) env('LLM_TIMEOUT', 900),
        'context' => (int) env('LLM_CONTEXT', 4096),
        // Cover pages are short; longer OCR text is cut to keep CPU time per document bounded.
        'max_chars' => (int) env('LLM_MAX_CHARS', 3000),
        'max_output_tokens' => 450,
        // CPU threads for the LLM (null = Ollama's default: half the logical CPUs).
        'threads' => env('LLM_THREADS') ? (int) env('LLM_THREADS') : null,
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
