import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from './settings';
import { brightness, judge, sharpness, toGray } from './imageQuality';

const W = 640;
const H = 480;

/** Synthetic page: `lines` lines of text strokes, ink `contrast` grey levels darker than the paper. */
function page(contrast: number, lines: number): Float32Array {
    const g = new Float32Array(W * H).fill(235);
    for (let y = 30, n = 0; n < lines && y < H - 20; y += 12, n++) {
        for (let x = 40; x < W - 40; x++) {
            if ((x * 7 + y) % 11 < 6) for (let k = 0; k < 3; k++) g[(y + k) * W + x] = 235 - contrast;
        }
    }
    return g;
}

function boxBlur(src: Float32Array, r: number): Float32Array {
    const out = new Float32Array(src.length);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let sum = 0;
            let n = 0;
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    sum += src[Math.min(H - 1, Math.max(0, y + dy)) * W + Math.min(W - 1, Math.max(0, x + dx))];
                    n++;
                }
            }
            out[y * W + x] = sum / n;
        }
    }
    return out;
}

/** Repeated box blur ≈ Gaussian, close to a real out-of-focus photo. */
const defocus = (g: Float32Array) => boxBlur(boxBlur(boxBlur(g, 1), 1), 1);

const thresholds = { minSharpness: DEFAULT_OPTIONS.minSharpness, minBrightness: DEFAULT_OPTIONS.minBrightness };
const verdict = (g: Float32Array) => judge(sharpness(g, W, H), brightness(g), thresholds).problem;

describe('image quality', () => {
    it('converts RGBA to luminance', () => {
        const g = toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
        expect(g[0]).toBeCloseTo(255);
        expect(g[1]).toBe(0);
    });

    it('accepts sharp pages: dark or faded ink, full or nearly empty', () => {
        for (const contrast of [215, 60]) {
            for (const lines of [35, 3]) {
                expect(verdict(page(contrast, lines)), `contrast ${contrast}, ${lines} lines`).toBeNull();
            }
        }
    });

    it('rejects out-of-focus pages, whatever the ink contrast', () => {
        for (const contrast of [215, 60]) {
            expect(verdict(defocus(page(contrast, 35))), `contrast ${contrast}`).toBe('blurry');
        }
    });

    it('does not depend on ink contrast or on how much of the page is blank', () => {
        const dark = sharpness(page(215, 35), W, H);
        expect(sharpness(page(60, 35), W, H)).toBeCloseTo(dark, 0);
        expect(sharpness(page(215, 3), W, H)).toBeGreaterThan(dark * 0.8);
    });

    it('gives 0 to a featureless frame (wall, blank surface, sensor noise)', () => {
        let seed = 1;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        expect(sharpness(new Float32Array(W * H).map(() => 128 + (rnd() - 0.5) * 6), W, H)).toBe(0);
    });

    it('flags a dark photo before calling it blurry', () => {
        expect(verdict(page(215, 35).map((v) => v * 0.15))).toBe('dark');
    });
});
