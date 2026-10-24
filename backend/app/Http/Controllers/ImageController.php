<?php

namespace App\Http\Controllers;

use App\Models\Image;
use App\Services\Thumbnails;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** Photos are served only to logged-in users (confidential archives), never as public files. */
class ImageController extends Controller
{
    public function show(Image $image): BinaryFileResponse
    {
        return $this->jpeg($this->path($image));
    }

    public function thumb(Image $image, Thumbnails $thumbs): BinaryFileResponse
    {
        return $this->jpeg($thumbs->for($this->path($image), "img-{$image->id}"));
    }

    private function path(Image $image): string
    {
        $path = Storage::disk('archive')->path($image->path);
        abort_unless(is_file($path), 404, 'Photo introuvable sur le disque.');

        return $path;
    }
}
