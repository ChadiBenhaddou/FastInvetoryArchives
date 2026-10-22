<?php

return [

    // Version shown in the UI and compared against phone export versions.
    'version' => env('APP_VERSION', 'dev'),

    /*
    | Host folder mounted at ARCHIVE_ROOT in the containers:
    |   import/    watched folder (ZIPs dropped here are imported automatically)
    |   imported/  ZIPs successfully imported
    |   failed/    ZIPs that failed, each with an error .txt
    |   storage/   box photos ("archive" disk)
    |   backups/   default backup destination
    */
    'root' => env('ARCHIVE_ROOT', storage_path('app/archive-dev')),

    'meilisearch' => [
        'host' => env('MEILISEARCH_HOST', 'http://meilisearch:7700'),
        'key' => env('MEILISEARCH_KEY'),
    ],

];
