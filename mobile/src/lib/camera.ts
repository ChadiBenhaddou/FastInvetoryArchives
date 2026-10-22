// Continuous camera preview in the WebView (the camera stays open between shots).

/* eslint-disable @typescript-eslint/no-explicit-any */
declare class ImageCapture {
    constructor(track: MediaStreamTrack);
    takePhoto(settings?: Record<string, unknown>): Promise<Blob>;
}

const TAKE_PHOTO_TIMEOUT_MS = 5000;

export class Camera {
    private takePhotoWorks: boolean | null = null;
    private stream: MediaStream | null = null;
    private capture: ImageCapture | null = null;
    private torchOn = false;

    async start(video: HTMLVideoElement): Promise<void> {
        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        video.srcObject = this.stream;
        await video.play();
        if ('ImageCapture' in window) this.capture = new ImageCapture(this.track!);
    }

    stop(): void {
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
        this.capture = null;
        this.torchOn = false;
    }

    private get track(): MediaStreamTrack | undefined {
        return this.stream?.getVideoTracks()[0];
    }

    get hasTorch(): boolean {
        const caps = this.track?.getCapabilities?.() as any;
        return Boolean(caps?.torch);
    }

    async setTorch(on: boolean): Promise<void> {
        if (!this.hasTorch) return;
        await this.track!.applyConstraints({ advanced: [{ torch: on } as any] });
        this.torchOn = on;
    }

    get torch(): boolean {
        return this.torchOn;
    }

    /** Full-resolution still when the device supports it, otherwise the current video frame. */
    async shoot(video: HTMLVideoElement): Promise<Blob> {
        if (this.capture && this.takePhotoWorks !== false) {
            try {
                // Some devices never answer takePhoto(): fall back after a few seconds
                // and stop trying it for the rest of the session.
                const blob = await Promise.race([
                    this.capture.takePhoto(),
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('takePhoto timeout')), TAKE_PHOTO_TIMEOUT_MS)),
                ]);
                this.takePhotoWorks = true;
                // Some devices switch the torch off after takePhoto(): restore it.
                if (this.torchOn) await this.setTorch(true).catch(() => {});
                return blob;
            } catch {
                this.takePhotoWorks = false; // fall back to the preview frame
            }
        }
        if (!video.videoWidth) throw new Error('camera not ready');
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')!.drawImage(video, 0, 0);
        return new Promise((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('capture failed'))), 'image/jpeg', 0.95),
        );
    }
}
