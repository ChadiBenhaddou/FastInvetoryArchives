// Photo quality metrics, computed on a downscaled grayscale copy (ANALYSIS_WIDTH wide)
// so that thresholds do not depend on the camera resolution.

export const ANALYSIS_WIDTH = 640;
const TILE = 40;
/** Tiles flatter than this (std-dev in grey levels) are blank paper or background. */
const MIN_TILE_STDDEV = 6;

export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
    const gray = new Float32Array(width * height);
    for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
        gray[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    }
    return gray;
}

/** Mean grey level, 0 (black) – 255 (white). */
export function brightness(gray: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < gray.length; i++) sum += gray[i];
    return gray.length ? sum / gray.length : 0;
}

/** Variance of the 4-neighbour Laplacian over a rectangle: high for crisp edges. */
export function laplacianVariance(gray: Float32Array, width: number, height: number, x0 = 0, y0 = 0, x1 = width, y1 = height): number {
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = Math.max(1, y0); y < Math.min(height - 1, y1); y++) {
        for (let x = Math.max(1, x0); x < Math.min(width - 1, x1); x++) {
            const i = y * width + x;
            const lap = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
            sum += lap;
            sumSq += lap * lap;
            n++;
        }
    }
    if (!n) return 0;
    const mean = sum / n;
    return sumSq / n - mean * mean;
}

function variance(gray: Float32Array, width: number, x0: number, y0: number, x1: number, y1: number): number {
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const v = gray[y * width + x];
            sum += v;
            sumSq += v * v;
            n++;
        }
    }
    const mean = sum / n;
    return sumSq / n - mean * mean;
}

/**
 * Sharpness score, independent of how faded the ink is and of how much of the
 * page is blank:
 *  - the image is cut into tiles and only tiles with content are kept;
 *  - in each, edge energy (Laplacian variance) is divided by the tile's own
 *    contrast (variance), which cancels out pale vs dark ink;
 *  - the score is the 80th percentile over content tiles (×100), i.e. "how crisp
 *    are the most detailed parts of the photo".
 * A photo with no content at all scores 0.
 */
export function sharpness(gray: Float32Array, width: number, height: number): number {
    const scores: number[] = [];
    for (let y0 = 0; y0 + TILE <= height; y0 += TILE) {
        for (let x0 = 0; x0 + TILE <= width; x0 += TILE) {
            const v = variance(gray, width, x0, y0, x0 + TILE, y0 + TILE);
            if (v < MIN_TILE_STDDEV * MIN_TILE_STDDEV) continue;
            scores.push((100 * laplacianVariance(gray, width, height, x0, y0, x0 + TILE, y0 + TILE)) / v);
        }
    }
    if (!scores.length) return 0;
    scores.sort((a, b) => a - b);
    return scores[Math.floor(scores.length * 0.8)];
}

export interface QualityVerdict {
    sharpness: number;
    brightness: number;
    problem: 'blurry' | 'dark' | null;
}

export function judge(
    sharpnessScore: number,
    meanBrightness: number,
    thresholds: { minSharpness: number; minBrightness: number },
): QualityVerdict {
    // Darkness first: a dark photo also looks "blurry", and the fix (light) differs.
    const problem =
        meanBrightness < thresholds.minBrightness ? 'dark' : sharpnessScore < thresholds.minSharpness ? 'blurry' : null;
    return { sharpness: sharpnessScore, brightness: meanBrightness, problem };
}
