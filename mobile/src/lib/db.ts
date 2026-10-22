// Box, photo and export records (IndexedDB inside the app's private storage).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Box, ExportRecord, Photo } from './types';

interface CaptureDB extends DBSchema {
    boxes: { key: string; value: Box; indexes: { status: string } };
    photos: { key: string; value: Photo; indexes: { boxCode: string } };
    exports: { key: string; value: ExportRecord };
}

let dbPromise: Promise<IDBPDatabase<CaptureDB>> | null = null;

function db() {
    dbPromise ??= openDB<CaptureDB>('archive-capture', 1, {
        upgrade(database) {
            database.createObjectStore('boxes', { keyPath: 'code' }).createIndex('status', 'status');
            database.createObjectStore('photos', { keyPath: 'id' }).createIndex('boxCode', 'boxCode');
            database.createObjectStore('exports', { keyPath: 'exportId' });
        },
    });
    return dbPromise;
}

export const getBox = async (code: string) => (await db()).get('boxes', code);
export const putBox = async (box: Box) => (await db()).put('boxes', box);
export const getExport = async (id: string) => (await db()).get('exports', id);
export const putExport = async (record: ExportRecord) => (await db()).put('exports', record);

export async function listBoxes(): Promise<Box[]> {
    const boxes = await (await db()).getAll('boxes');
    return boxes.sort((a, b) => b.sequence - a.sequence);
}

export async function boxesWithStatus(status: Box['status']): Promise<Box[]> {
    const boxes = await (await db()).getAllFromIndex('boxes', 'status', status);
    return boxes.sort((a, b) => a.sequence - b.sequence);
}

export async function listExports(): Promise<ExportRecord[]> {
    const exports = await (await db()).getAll('exports');
    return exports.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function photosOf(boxCode: string): Promise<Photo[]> {
    const photos = await (await db()).getAllFromIndex('photos', 'boxCode', boxCode);
    return photos.sort((a, b) => a.sequence - b.sequence);
}

export const putPhoto = async (photo: Photo) => (await db()).put('photos', photo);
export const deletePhotoRecord = async (id: string) => (await db()).delete('photos', id);

export async function deletePhotosOf(boxCode: string): Promise<void> {
    const tx = (await db()).transaction('photos', 'readwrite');
    for (const key of await tx.store.index('boxCode').getAllKeys(boxCode)) {
        await tx.store.delete(key);
    }
    await tx.done;
}
