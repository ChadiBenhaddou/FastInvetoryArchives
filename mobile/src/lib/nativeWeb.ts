// Browser fallback of ArchiveNative, for development only: builds the ZIP in memory
// and downloads it. Handy to produce sample exports for the PC import.
import { WebPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { zipSync, strToU8 } from 'fflate';
import type { ArchiveNativePlugin, ZipEntry } from './native';

function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

export class ArchiveNativeWeb extends WebPlugin implements Omit<ArchiveNativePlugin, 'addListener'> {
    async createZip(options: { fileName: string; manifest: string; entries: ZipEntry[] }) {
        const files: Record<string, [Uint8Array, { level: 0 }]> = {
            'manifest.json': [strToU8(options.manifest), { level: 0 }],
        };
        let done = 0;
        for (const entry of options.entries) {
            const { data } = await Filesystem.readFile({ path: entry.source, directory: Directory.Data });
            files[entry.name] = [base64ToBytes(data as string), { level: 0 }];
            this.notifyListeners('zipProgress', { done: ++done, total: options.entries.length });
        }
        const zip = zipSync(files);
        const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: options.fileName });
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        return { path: `Téléchargements/${options.fileName}`, size: zip.byteLength };
    }

    async exportFileInfo() {
        return { exists: false, size: 0 };
    }

    async storageInfo() {
        const estimate = await navigator.storage?.estimate?.();
        const quota = estimate?.quota ?? 0;
        const usage = estimate?.usage ?? 0;
        return { freeBytes: quota - usage, totalBytes: quota, photosBytes: usage };
    }
}
