<?php

namespace App\Http\Controllers;

use Symfony\Component\HttpFoundation\BinaryFileResponse;

abstract class Controller
{
    /**
     * A photo for a logged-in user. Photo URLs carry database ids, which start again at 1
     * after a reset or a restore: the browser must check its copy (ETag, 304 when unchanged)
     * instead of trusting a URL for days and showing the photo of another box.
     */
    protected function jpeg(string $path): BinaryFileResponse
    {
        $response = response()->file($path, ['Content-Type' => 'image/jpeg', 'Cache-Control' => 'no-cache']);
        // BinaryFileResponse is public by default: confidential photos must stay private.
        $response->setPrivate();
        $response->setAutoEtag();
        $response->isNotModified(request());

        return $response;
    }
}
