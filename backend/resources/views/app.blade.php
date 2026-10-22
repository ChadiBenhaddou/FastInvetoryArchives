<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ config('app.name') }}</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    {{-- No inline scripts: the Content-Security-Policy only allows bundled files. --}}
    <meta name="app-name" content="{{ config('app.name') }}">
    <meta name="app-version" content="{{ config('archive.version') }}">
    @vite(['resources/css/app.css', 'resources/js/main.jsx'])
</head>
<body class="h-full">
    <div id="root"></div>
</body>
</html>
