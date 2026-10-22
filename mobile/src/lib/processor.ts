// UI-side client of the image worker.
import type { QualityVerdict } from './imageQuality';
import type { CaptureOptions, PhotoType } from './types';

export interface ProcessRequest {
    id: number;
    blob: Blob;
    type: PhotoType;
    options: CaptureOptions;
    /** Keep the photo even if it fails the quality check. */
    override: boolean;
}

export interface ProcessedPhoto {
    jpeg: ArrayBuffer;
    thumb: Blob;
    width: number;
    height: number;
    sha256: string;
    sharpness: number;
    brightness: number;
    override: boolean;
    cropped: boolean;
}

export type ProcessResponse =
    | { id: number; ok: true; rejected?: QualityVerdict; result?: ProcessedPhoto }
    | { id: number; ok: false; error: string };

/** A photo that takes longer than this is abandoned (the agent can shoot again). */
const TIMEOUT_MS = 90_000;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: ProcessResponse) => void; reject: (e: Error) => void }>();

function failAll(error: Error) {
    pending.forEach(({ reject }) => reject(error));
    pending.clear();
}

function getWorker(): Worker {
    if (!worker) {
        worker = new Worker(new URL('./imageWorker.ts', import.meta.url));
        worker.onmessage = (e: MessageEvent<ProcessResponse>) => {
            pending.get(e.data.id)?.resolve(e.data);
            pending.delete(e.data.id);
        };
        // A crashed worker (e.g. out of memory) must not leave the capture screen stuck.
        worker.onerror = (e) => {
            failAll(new Error(e.message || 'image worker crashed'));
            worker?.terminate();
            worker = null;
        };
    }
    return worker;
}

/** Starts loading the document-crop engine in the background. */
export function warmUpProcessor(): void {
    getWorker().postMessage({ warmup: true });
}

export function processPhoto(
    blob: Blob,
    type: PhotoType,
    options: CaptureOptions,
    override = false,
): Promise<{ rejected?: QualityVerdict; result?: ProcessedPhoto }> {
    const id = nextId++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error('image processing timeout'));
        }, TIMEOUT_MS);
        pending.set(id, {
            resolve: (r) => {
                clearTimeout(timer);
                if (r.ok) resolve(r);
                else reject(new Error(r.error));
            },
            reject: (e) => {
                clearTimeout(timer);
                reject(e);
            },
        });
        getWorker().postMessage({ id, blob, type, options, override } satisfies ProcessRequest);
    });
}
