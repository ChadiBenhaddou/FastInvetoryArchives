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
        // Size and date in the name: ids are reused after a reset or a restore (which may keep
        // the photos' old dates), so the id alone could return the preview of another photo.
        $target = storage_path(sprintf('app/thumbs/%s-%x-%x.jpg', $cacheKey, filesize($source), filemtime($source)));
        if (is_file($target)) {
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
