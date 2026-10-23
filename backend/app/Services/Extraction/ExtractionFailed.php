<?php

namespace App\Services\Extraction;

use RuntimeException;

/** The LLM answered, but never with usable JSON: the document goes to review (no retry). */
class ExtractionFailed extends RuntimeException {}
