// Document edge detection with OpenCV.js (bundled, loaded lazily inside the image worker).
// Conservative on purpose: when in doubt, the photo is kept uncropped.

/* eslint-disable @typescript-eslint/no-explicit-any */
type CV = any;

// opencv.js is shipped as a static file and loaded with importScripts() (classic worker),
// NOT through the bundler: its module object has a `then` method, and bundler interop turns
// `import()` of it into a promise that keeps adopting itself and never settles.
// For the same reason the module is never awaited directly, only wrapped in { cv }.
import opencvUrl from '@techstark/opencv-js/dist/opencv.js?url';

const LOAD_TIMEOUT_MS = 120_000;
let ready: Promise<void> | null = null;

export function loadOpenCv(): Promise<{ cv: CV }> {
    const scope = self as any;
    ready ??= new Promise<void>((resolve, reject) => {
        try {
            scope.importScripts(opencvUrl);
        } catch (e) {
            reject(e);
            return;
        }
        const started = Date.now();
        const poll = setInterval(() => {
            if (scope.cv?.Mat) {
                clearInterval(poll);
                resolve();
            } else if (Date.now() - started > LOAD_TIMEOUT_MS) {
                clearInterval(poll);
                reject(new Error('OpenCV did not initialize'));
            }
        }, 50);
    });
    return ready.then(() => ({ cv: scope.cv }));
}

export type Point = { x: number; y: number };

/** Orders 4 points as top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(points: Point[]): [Point, Point, Point, Point] {
    const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
    const byDiff = [...points].sort((a, b) => a.y - a.x - (b.y - b.x));
    return [bySum[0], byDiff[0], bySum[3], byDiff[3]];
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Finds the document outline in a (small) RGBA image.
 * Returns corners in that image's coordinates, or null.
 */
export function findDocumentQuad(cv: CV, image: ImageData): [Point, Point, Point, Point] | null {
    const src = cv.matFromImageData(image);
    const gray = new cv.Mat();
    const edges = new cv.Mat();
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
        cv.Canny(gray, edges, 50, 150);
        const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
        cv.dilate(edges, edges, kernel);
        kernel.delete();
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        const imageArea = image.width * image.height;
        let best: { area: number; points: Point[] } | null = null;

        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);
            if (area > imageArea * 0.25 && (!best || area > best.area)) {
                const approx = new cv.Mat();
                cv.approxPolyDP(contour, approx, 0.02 * cv.arcLength(contour, true), true);
                if (approx.rows === 4 && cv.isContourConvex(approx)) {
                    const points: Point[] = [];
                    for (let p = 0; p < 4; p++) {
                        points.push({ x: approx.data32S[p * 2], y: approx.data32S[p * 2 + 1] });
                    }
                    best = { area, points };
                }
                approx.delete();
            }
            contour.delete();
        }

        // A quad covering ~the whole frame means "no edge found", not a document.
        if (!best || best.area > imageArea * 0.97) return null;
        return orderCorners(best.points);
    } finally {
        src.delete();
        gray.delete();
        edges.delete();
        contours.delete();
        hierarchy.delete();
    }
}

/** Straightens the document: returns the warped RGBA image. */
export function warpDocument(cv: CV, image: ImageData, corners: [Point, Point, Point, Point]): ImageData {
    const [tl, tr, br, bl] = corners;
    const width = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
    const height = Math.round(Math.max(dist(tl, bl), dist(tr, br)));

    const src = cv.matFromImageData(image);
    const dst = new cv.Mat();
    const from = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
    const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]);
    const matrix = cv.getPerspectiveTransform(from, to);
    try {
        cv.warpPerspective(src, dst, matrix, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
        return new ImageData(new Uint8ClampedArray(dst.data), width, height);
    } finally {
        src.delete();
        dst.delete();
        from.delete();
        to.delete();
        matrix.delete();
    }
}
