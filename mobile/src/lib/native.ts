// Native helpers implemented in android/app/src/main/java/.../ArchiveNativePlugin.java.
// In a desktop browser (development) a web fallback is used instead.
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface ZipEntry {
    /** Path relative to the app data directory. */
    source: string;
    /** Path inside the ZIP. */
    name: string;
}

export interface ArchiveNativePlugin {
    /**
     * Streams the ZIP to Documents/ArchiveInventory/exports/{fileName}
     * (written as .part then renamed, then made visible over USB).
     */
    createZip(options: { fileName: string; manifest: string; entries: ZipEntry[] }): Promise<{ path: string; size: number }>;
    exportFileInfo(options: { fileName: string }): Promise<{ exists: boolean; size: number }>;
    storageInfo(): Promise<{ freeBytes: number; totalBytes: number; photosBytes: number }>;
    addListener(event: 'zipProgress', handler: (p: { done: number; total: number }) => void): Promise<PluginListenerHandle>;
}

export const ArchiveNative = registerPlugin<ArchiveNativePlugin>('ArchiveNative', {
    web: () => import('./nativeWeb').then((m) => new m.ArchiveNativeWeb()),
});

export const EXPORT_FOLDER = 'Documents/ArchiveInventory/exports';
