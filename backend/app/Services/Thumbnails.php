<?php

namespace App\Services;

use RuntimeException;

/** Small JPEG previews (lists, review, search results), generated once and cached. */
class Thumbnails
{
    public const WIDTH = 480;

    /** Path of the cached thumbnail for $source (created if needed). */
    public function for(string $source, string $cacheKey): string
    {
        $target = storage_path("app/thumbs/{$cacheKey}.jpg");
        if (is_file($target) && filemtime($target) >= filemtime($source)) {
            return $target;
        }

        $img = @imagecreatefromjpeg($source);
        if (! $img) {
            throw new RuntimeException("Unreadable image {$source}");
        }
        $scaled = imagescale($img, min(self::WIDTH, imagesx($img)), -1, IMG_BICUBIC);
        @mkdir(dirname($target), 0775, true);
        // Write then rename: two requests for the same thumbnail never see a half file.
        $tmp = $target.'.'.getmypid().'.tmp';
        imagejpeg($scaled, $tmp, 75);
        rename($tmp, $target);

        return $target;
    }
}
