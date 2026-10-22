// Builds manifest.json for an export ZIP. Contract: shared/manifest.schema.json
import type { Box, Photo, Profile } from './types';
import { stamp } from './time';

export interface ManifestPhoto {
    sequence: number;
    type: Photo['type'];
    file: string;
    sha256: string;
    width: number;
    height: number;
    taken_at: string;
    quality: { sharpness: number; brightness: number; override: boolean; cropped: boolean };
}

export interface Manifest {
    format_version: 1;
    export_id: string;
    device_letter: string;
    agent_name: string;
    app_version: string;
    exported_at: string;
    sequence_range: { from: number | null; to: number | null; last_issued: number };
    voided_sequences: number[];
    boxes: {
        code: string;
        sequence: number;
        location: Box['location'];
        created_at: string;
        closed_at: string;
        photos: ManifestPhoto[];
    }[];
}

/** Relative path of a photo, on the phone and inside the ZIP. */
export function photoPath(boxCode: string, sequence: number): string {
    const name = String(sequence).padStart(3, '0') + (sequence === 0 ? '_code' : '');
    return `boxes/${boxCode}/${name}.jpg`;
}

export function exportFileName(deviceLetter: string, date: Date, boxCount: number): string {
    return `${deviceLetter}_${stamp(date)}_${boxCount}boxes.zip`;
}

const round = (n: number) => Math.round(n * 10) / 10;

export function buildManifest(input: {
    exportId: string;
    profile: Pick<Profile, 'agentName' | 'deviceLetter'>;
    appVersion: string;
    exportedAt: string;
    lastIssued: number;
    boxes: { box: Box; photos: Photo[] }[];
    voidedSequences: number[];
}): Manifest {
    const sequences = input.boxes.map(({ box }) => box.sequence);

    return {
        format_version: 1,
        export_id: input.exportId,
        device_letter: input.profile.deviceLetter,
        agent_name: input.profile.agentName,
        app_version: input.appVersion,
        exported_at: input.exportedAt,
        sequence_range: {
            from: sequences.length ? Math.min(...sequences) : null,
            to: sequences.length ? Math.max(...sequences) : null,
            last_issued: input.lastIssued,
        },
        voided_sequences: [...input.voidedSequences].sort((a, b) => a - b),
        boxes: input.boxes.map(({ box, photos }) => {
            if (!box.closedAt) throw new Error(`Box ${box.code} is not closed`);
            if (photos[0]?.type !== 'code_photo') throw new Error(`Box ${box.code} has no code photo`);
            return {
                code: box.code,
                sequence: box.sequence,
                location: box.location,
                created_at: box.createdAt,
                closed_at: box.closedAt,
                photos: photos.map((p) => ({
                    sequence: p.sequence,
                    type: p.type,
                    file: p.path,
                    sha256: p.sha256,
                    width: p.width,
                    height: p.height,
                    taken_at: p.takenAt,
                    quality: { sharpness: round(p.sharpness), brightness: round(p.brightness), override: p.override, cropped: p.cropped },
                })),
            };
        }),
    };
}
