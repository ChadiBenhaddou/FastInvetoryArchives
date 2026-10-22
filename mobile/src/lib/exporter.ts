// "Export session": every closed, not-yet-exported box → one ZIP in Documents/ArchiveInventory/exports.
import * as db from './db';
import { buildManifest, exportFileName } from './manifest';
import { ArchiveNative, type ZipEntry } from './native';
import { deleteBoxFolder } from './photoStore';
import { getLastIssued } from './settings';
import { isoLocal } from './time';
import type { Box, ExportRecord, Profile } from './types';

declare const __APP_VERSION__: string;

export interface PendingExport {
    boxes: Box[];
    voided: Box[];
    photoCount: number;
}

export async function pendingExport(): Promise<PendingExport> {
    const boxes = await db.boxesWithStatus('closed');
    const voided = (await db.boxesWithStatus('voided')).filter((b) => !b.exportId);
    return { boxes, voided, photoCount: boxes.reduce((n, b) => n + b.photoCount, 0) };
}

async function writeZip(
    exportId: string,
    fileName: string,
    profile: Profile,
    boxes: Box[],
    voidedSequences: number[],
    lastIssued: number,
    onProgress?: (done: number, total: number) => void,
) {
    const withPhotos = await Promise.all(boxes.map(async (box) => ({ box, photos: await db.photosOf(box.code) })));
    const manifest = buildManifest({
        exportId,
        profile,
        appVersion: __APP_VERSION__,
        exportedAt: isoLocal(),
        lastIssued,
        boxes: withPhotos,
        voidedSequences,
    });
    const entries: ZipEntry[] = withPhotos.flatMap(({ photos }) => photos.map((p) => ({ source: p.path, name: p.path })));

    const listener = onProgress
        ? await ArchiveNative.addListener('zipProgress', ({ done, total }) => onProgress(done, total))
        : null;
    try {
        const zip = await ArchiveNative.createZip({ fileName, manifest: JSON.stringify(manifest, null, 2), entries });
        return { zip, photoCount: entries.length };
    } finally {
        await listener?.remove();
    }
}

/** Never overwrite another export's ZIP (two exports in the same minute). */
async function uniqueFileName(base: string): Promise<string> {
    const used = new Set((await db.listExports()).map((e) => e.fileName));
    let name = base;
    for (let n = 2; used.has(name) || (await ArchiveNative.exportFileInfo({ fileName: name })).exists; n++) {
        name = base.replace(/\.zip$/, `_${n}.zip`);
    }
    return name;
}

export async function runExport(profile: Profile, onProgress?: (done: number, total: number) => void): Promise<ExportRecord> {
    const { boxes, voided } = await pendingExport();
    if (!boxes.length && !voided.length) throw new Error('NOTHING_TO_EXPORT');

    const exportId = crypto.randomUUID();
    const now = new Date();
    const fileName = await uniqueFileName(exportFileName(profile.deviceLetter, now, boxes.length));
    const lastIssued = await getLastIssued();
    const voidedSequences = voided.map((b) => b.sequence);

    // The ZIP is written first: if the app dies before the records below are saved,
    // the boxes are simply exported again next time and the PC skips the duplicates.
    const { zip, photoCount } = await writeZip(exportId, fileName, profile, boxes, voidedSequences, lastIssued, onProgress);

    const sequences = boxes.map((b) => b.sequence);
    const record: ExportRecord = {
        exportId,
        fileName,
        createdAt: isoLocal(now),
        boxCodes: boxes.map((b) => b.code),
        voidedSequences,
        boxCount: boxes.length,
        photoCount,
        sizeBytes: zip.size,
        sequenceFrom: sequences.length ? Math.min(...sequences) : null,
        sequenceTo: sequences.length ? Math.max(...sequences) : null,
        lastIssued,
        purgedAt: null,
    };
    await db.putExport(record);
    for (const box of [...boxes, ...voided]) {
        box.exportId = exportId;
        if (box.status === 'closed') box.status = 'exported';
        await db.putBox(box);
    }
    return record;
}

/** Rebuilds a lost ZIP: same export_id and file name, so the PC treats it as the same export. */
export async function reExport(
    profile: Profile,
    record: ExportRecord,
    onProgress?: (done: number, total: number) => void,
): Promise<void> {
    if (record.purgedAt) throw new Error('ALREADY_PURGED');
    const boxes = (await Promise.all(record.boxCodes.map((code) => db.getBox(code)))).filter((b): b is Box => !!b);
    const { zip } = await writeZip(record.exportId, record.fileName, profile, boxes, record.voidedSequences, record.lastIssued, onProgress);
    record.sizeBytes = zip.size;
    await db.putExport(record);
}

/** After the PC confirmed the import (admin PIN): delete the photos to free space. */
export async function purgeExport(record: ExportRecord): Promise<void> {
    for (const code of record.boxCodes) {
        await deleteBoxFolder(code);
        await db.deletePhotosOf(code);
        const box = await db.getBox(code);
        if (box) {
            box.purged = true;
            await db.putBox(box);
        }
    }
    record.purgedAt = isoLocal();
    await db.putExport(record);
}
