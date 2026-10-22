import { describe, expect, it } from 'vitest';
import schema from '../../../shared/manifest.schema.json';
import { buildManifest, exportFileName, photoPath } from './manifest';
import type { Box, Photo } from './types';

function box(sequence: number, code: string): Box {
    return {
        code,
        sequence,
        status: 'closed',
        location: { room: 'Salle 2', shelf: 'B', row: null },
        createdAt: '2026-10-22T09:00:00+01:00',
        closedAt: '2026-10-22T09:20:00+01:00',
        exportId: null,
        photoCount: 2,
        purged: false,
    };
}

function photo(boxCode: string, sequence: number): Photo {
    return {
        id: `${boxCode}/${sequence}`,
        boxCode,
        sequence,
        type: sequence === 0 ? 'code_photo' : 'document',
        path: photoPath(boxCode, sequence),
        sha256: 'a'.repeat(64),
        width: 2000,
        height: 1500,
        size: 400_000,
        takenAt: '2026-10-22T09:05:00+01:00',
        sharpness: 123.456,
        brightness: 180.04,
        override: false,
        cropped: sequence > 0,
        thumb: new Blob(),
    };
}

const input = {
    exportId: '7d1c9a52-3b0e-4b8f-9a55-2b8f0f1d2c3e',
    profile: { agentName: 'Amina', deviceLetter: 'A' },
    appVersion: '1.0.0',
    exportedAt: '2026-10-22T18:00:00+01:00',
    lastIssued: 125,
    voidedSequences: [124, 120],
    openSequences: [125],
    boxes: [
        { box: box(123, 'A-0123-N'), photos: [photo('A-0123-N', 0), photo('A-0123-N', 1)] },
        { box: box(121, 'A-0121-L'), photos: [photo('A-0121-L', 0)] },
    ],
};

describe('manifest', () => {
    it('names photo files as specified', () => {
        expect(photoPath('A-0123-N', 0)).toBe('boxes/A-0123-N/000_code.jpg');
        expect(photoPath('A-0123-N', 7)).toBe('boxes/A-0123-N/007.jpg');
    });

    it('names the export file {LETTER}_{YYYYMMDD_HHmm}_{n}boxes.zip', () => {
        expect(exportFileName('A', new Date(2026, 9, 22, 8, 5), 12)).toBe('A_20261022_0805_12boxes.zip');
    });

    it('records the sequence range, counter and voided codes', () => {
        const m = buildManifest(input);
        expect(m.sequence_range).toEqual({ from: 121, to: 123, last_issued: 125 });
        expect(m.voided_sequences).toEqual([120, 124]);
        expect(m.boxes[0].photos[0]).toMatchObject({ type: 'code_photo', file: 'boxes/A-0123-N/000_code.jpg' });
        expect(m.boxes[0].photos[1].quality).toEqual({ sharpness: 123.5, brightness: 180, override: false, cropped: true });
    });

    it('only uses keys allowed by the shared schema', () => {
        const m = buildManifest(input);
        expect(Object.keys(m).sort()).toEqual(Object.keys(schema.properties).sort());
        expect(m.open_sequences).toEqual([125]);
        const boxSchema = schema.properties.boxes.items;
        expect(Object.keys(m.boxes[0]).sort()).toEqual([...boxSchema.required].sort());
        expect(Object.keys(m.boxes[0].photos[0]).sort()).toEqual([...boxSchema.properties.photos.items.required].sort());
    });

    it('refuses a box without its code photo', () => {
        expect(() =>
            buildManifest({ ...input, boxes: [{ box: box(1, 'A-0001-C'), photos: [photo('A-0001-C', 1)] }] }),
        ).toThrow(/code photo/);
    });
});
