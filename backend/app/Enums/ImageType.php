<?php

namespace App\Enums;

enum ImageType: string
{
    /** First photo of every box: the handwritten code on the box. */
    case CodePhoto = 'code_photo';
    case Document = 'document';
}
