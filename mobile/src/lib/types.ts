export type BoxStatus = 'open' | 'closed' | 'exported' | 'voided';
export type PhotoType = 'code_photo' | 'document';

export interface Location {
    room: string | null;
    shelf: string | null;
    row: string | null;
}

export interface Box {
    code: string;
    sequence: number;
    status: BoxStatus;
    location: Location;
    createdAt: string;
    closedAt: string | null;
    /** Set once the box went into an export (voided boxes too: they are reported once). */
    exportId: string | null;
    photoCount: number;
    /** Photos deleted from the phone after the PC confirmed the import. */
    purged: boolean;
}

export interface Photo {
    /** "{boxCode}/{sequence}" */
    id: string;
    boxCode: string;
    sequence: number;
    type: PhotoType;
    /** Relative to the app data directory, identical to the path inside the ZIP. */
    path: string;
    sha256: string;
    width: number;
    height: number;
    size: number;
    takenAt: string;
    sharpness: number;
    brightness: number;
    override: boolean;
    cropped: boolean;
    /** Small JPEG for the UI grid. */
    thumb: Blob;
}

export interface ExportRecord {
    exportId: string;
    fileName: string;
    createdAt: string;
    boxCodes: string[];
    voidedSequences: number[];
    boxCount: number;
    photoCount: number;
    sizeBytes: number;
    sequenceFrom: number | null;
    sequenceTo: number | null;
    lastIssued: number;
    /** Set when the admin confirmed the PC import and the photos were deleted. */
    purgedAt: string | null;
}

export interface Profile {
    agentName: string;
    deviceLetter: string;
    language: 'fr' | 'ar';
    pinHash: string;
    pinSalt: string;
    setupAt: string;
}

export interface Presets {
    rooms: string[];
    shelves: string[];
    rows: string[];
}

export interface CaptureOptions {
    autoCrop: boolean;
    /** Contrast-normalized sharpness score (see imageQuality.sharpness); below → blurry. */
    minSharpness: number;
    /** Mean grey level 0-255; below → too dark. */
    minBrightness: number;
}
