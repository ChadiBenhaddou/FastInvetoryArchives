// Box lifecycle on the phone: open → closed → exported (or voided).
import { makeCode } from './boxCode';
import * as db from './db';
import { photoPath } from './manifest';
import { deleteBoxFolder, deletePhotoFile, writePhoto } from './photoStore';
import type { ProcessedPhoto } from './processor';
import { issueSequence, saveLastLocation } from './settings';
import { isoLocal } from './time';
import type { Box, Location, Photo, Profile } from './types';

export class BoxError extends Error {
    constructor(public readonly code: 'BOX_ALREADY_OPEN' | 'NO_CODE_PHOTO' | 'NOT_OPEN' | 'ALREADY_EXPORTED') {
        super(code);
    }
}

export async function currentOpenBox(): Promise<Box | undefined> {
    return (await db.boxesWithStatus('open'))[0];
}

/** Issues the next code. The counter is saved before the code is shown. */
export async function createBox(profile: Profile, location: Location): Promise<Box> {
    if (await currentOpenBox()) throw new BoxError('BOX_ALREADY_OPEN');

    const sequence = await issueSequence();
    const box: Box = {
        code: makeCode(profile.deviceLetter, sequence),
        sequence,
        status: 'open',
        location,
        createdAt: isoLocal(),
        closedAt: null,
        exportId: null,
        photoCount: 0,
        purged: false,
    };
    await db.putBox(box);
    await saveLastLocation(location);
    return box;
}

/** Photo 0 is always the handwritten code on the box; the following ones are documents. */
export async function addPhoto(box: Box, processed: ProcessedPhoto): Promise<Photo> {
    if (box.status !== 'open') throw new BoxError('NOT_OPEN');

    const sequence = box.photoCount;
    const photo: Photo = {
        id: `${box.code}/${sequence}`,
        boxCode: box.code,
        sequence,
        type: sequence === 0 ? 'code_photo' : 'document',
        path: photoPath(box.code, sequence),
        sha256: processed.sha256,
        width: processed.width,
        height: processed.height,
        size: processed.jpeg.byteLength,
        takenAt: isoLocal(),
        sharpness: processed.sharpness,
        brightness: processed.brightness,
        override: processed.override,
        cropped: processed.cropped,
        thumb: processed.thumb,
    };

    await writePhoto(photo.path, processed.jpeg);
    await db.putPhoto(photo);
    box.photoCount = sequence + 1;
    await db.putBox(box);
    return photo;
}

export async function deleteLastPhoto(box: Box): Promise<void> {
    if (box.status !== 'open' || box.photoCount === 0) return;

    const sequence = box.photoCount - 1;
    await deletePhotoFile(photoPath(box.code, sequence));
    await db.deletePhotoRecord(`${box.code}/${sequence}`);
    box.photoCount = sequence;
    await db.putBox(box);
}

export async function closeBox(box: Box): Promise<void> {
    if (box.status !== 'open') throw new BoxError('NOT_OPEN');
    if (box.photoCount < 1) throw new BoxError('NO_CODE_PHOTO');

    box.status = 'closed';
    box.closedAt = isoLocal();
    await db.putBox(box);
}

/** A closed box can be reopened until it has been exported. */
export async function reopenBox(box: Box): Promise<void> {
    if (box.status !== 'closed') throw new BoxError('ALREADY_EXPORTED');
    if (await currentOpenBox()) throw new BoxError('BOX_ALREADY_OPEN');

    box.status = 'open';
    box.closedAt = null;
    await db.putBox(box);
}

/**
 * Cancels an open box: its photos are deleted and its code is reported to the PC
 * as voided (so it is not taken for a lost box). The agent crosses the code out.
 */
export async function voidBox(box: Box): Promise<void> {
    if (box.status !== 'open') throw new BoxError('NOT_OPEN');

    await deleteBoxFolder(box.code);
    await db.deletePhotosOf(box.code);
    box.status = 'voided';
    box.photoCount = 0;
    box.closedAt = isoLocal();
    await db.putBox(box);
}
