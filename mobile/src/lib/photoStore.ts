// Photo files in the app's private data directory: boxes/{code}/{NNN}.jpg
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

function toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

export async function writePhoto(path: string, jpeg: ArrayBuffer): Promise<void> {
    await Filesystem.writeFile({ path, data: toBase64(jpeg), directory: Directory.Data, recursive: true });
}

export async function deletePhotoFile(path: string): Promise<void> {
    await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => {});
}

export async function deleteBoxFolder(boxCode: string): Promise<void> {
    await Filesystem.rmdir({ path: `boxes/${boxCode}`, directory: Directory.Data, recursive: true }).catch(() => {});
}

/** URL usable in <img src> for a full-size photo. */
export async function photoUrl(path: string): Promise<string> {
    if (Capacitor.isNativePlatform()) {
        const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
        return Capacitor.convertFileSrc(uri);
    }
    const { data } = await Filesystem.readFile({ path, directory: Directory.Data });
    return `data:image/jpeg;base64,${data}`;
}
