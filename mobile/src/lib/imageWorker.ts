/// <reference lib="webworker" />
// Runs off the UI thread: quality check → optional document crop → resize → JPEG → SHA-256.
import { ANALYSIS_WIDTH, brightness, judge, sharpness, toGray } from './imageQuality';
import { findDocumentQuad, loadOpenCv, warpDocument } from './docCrop';
import { sha256Hex } from './pin';
import type { ProcessRequest, ProcessResponse } from './processor';

const MAX_SIDE = 2000;
const WORK_SIDE = 2600; // working resolution for the perspective warp
const JPEG_QUALITY = 0.8;
const THUMB_SIDE = 240;

type Source = ImageBitmap | OffscreenCanvas;

function fitSize(width: number, height: number, maxSide: number) {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function draw(source: Source, width: number, height: number): OffscreenCanvas {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, width, height);
    return canvas;
}

function pixels(canvas: OffscreenCanvas): ImageData {
    return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
}

function fromPixels(image: ImageData): OffscreenCanvas {
    const canvas = new OffscreenCanvas(image.width, image.height);
    canvas.getContext('2d')!.putImageData(image, 0, 0);
    return canvas;
}

async function process(req: ProcessRequest): Promise<ProcessResponse> {
    const bitmap = await createImageBitmap(req.blob);
    try {
        // 1. Quality, measured at a fixed width so thresholds are resolution-independent.
        const small = pixels(draw(bitmap, ANALYSIS_WIDTH, Math.round((bitmap.height * ANALYSIS_WIDTH) / bitmap.width)));
        const gray = toGray(small.data, small.width, small.height);
        const verdict = judge(sharpness(gray, small.width, small.height), brightness(gray), req.options);

        if (verdict.problem && !req.override) {
            return { id: req.id, ok: true, rejected: verdict };
        }

        // 2. Document crop (never on the code photo: the box itself must stay visible).
        const work = fitSize(bitmap.width, bitmap.height, WORK_SIDE);
        let image: OffscreenCanvas = draw(bitmap, work.width, work.height);
        let cropped = false;

        if (req.type === 'document' && req.options.autoCrop) {
            try {
                const { cv } = await loadOpenCv();
                const quad = findDocumentQuad(cv, small);
                if (quad) {
                    const k = work.width / small.width;
                    const corners = quad.map((p) => ({ x: p.x * k, y: p.y * k })) as typeof quad;
                    const warped = warpDocument(cv, pixels(image), corners);
                    const ratio = warped.width / warped.height;
                    if (ratio > 0.3 && ratio < 3.3) {
                        image = fromPixels(warped);
                        cropped = true;
                    }
                }
            } catch (e) {
                console.warn('Auto-crop skipped', e);
            }
        }

        // 3. Final size + JPEG + checksum.
        const out = fitSize(image.width, image.height, MAX_SIDE);
        const jpegBlob = await draw(image, out.width, out.height).convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
        const jpeg = await jpegBlob.arrayBuffer();
        const thumbSize = fitSize(out.width, out.height, THUMB_SIDE);
        const thumb = await draw(image, thumbSize.width, thumbSize.height).convertToBlob({ type: 'image/jpeg', quality: 0.7 });

        return {
            id: req.id,
            ok: true,
            result: {
                jpeg,
                thumb,
                width: out.width,
                height: out.height,
                sha256: await sha256Hex(jpeg),
                sharpness: verdict.sharpness,
                brightness: verdict.brightness,
                override: Boolean(verdict.problem),
                cropped,
            },
        };
    } finally {
        bitmap.close();
    }
}

self.onmessage = async (event: MessageEvent<ProcessRequest | { warmup: true }>) => {
    if ('warmup' in event.data) {
        // OpenCV is ~11 MB to compile: start while the agent photographs the box code.
        loadOpenCv().catch((e) => console.warn('OpenCV preload failed', e));
        return;
    }
    let response: ProcessResponse;
    try {
        response = await process(event.data);
    } catch (e) {
        response = { id: event.data.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const transfer = response.ok && response.result ? [response.result.jpeg] : [];
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(response, transfer);
};
