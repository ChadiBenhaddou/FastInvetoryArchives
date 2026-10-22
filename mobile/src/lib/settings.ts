// Small settings kept in native SharedPreferences (more robust than WebView storage).
import { Preferences } from '@capacitor/preferences';
import { MAX_SEQUENCE } from './boxCode';
import type { CaptureOptions, Location, Presets, Profile } from './types';

const KEYS = {
    profile: 'profile',
    nextSequence: 'nextSequence',
    presets: 'presets',
    options: 'captureOptions',
    lastLocation: 'lastLocation',
} as const;

export const DEFAULT_PRESETS: Presets = { rooms: [], shelves: [], rows: [] };
// minSharpness: starting value from synthetic tests (sharp ≈ 800, slight blur < 80);
// calibrate on the real phones with real pages (the score is shown after each shot).
export const DEFAULT_OPTIONS: CaptureOptions = { autoCrop: true, minSharpness: 50, minBrightness: 55 };

async function getJson<T>(key: string, fallback: T): Promise<T> {
    const { value } = await Preferences.get({ key });
    if (value === null) return fallback;
    try {
        return { ...fallback, ...JSON.parse(value) };
    } catch {
        return fallback;
    }
}

async function setJson(key: string, value: unknown): Promise<void> {
    await Preferences.set({ key, value: JSON.stringify(value) });
}

export async function getProfile(): Promise<Profile | null> {
    const { value } = await Preferences.get({ key: KEYS.profile });
    return value ? (JSON.parse(value) as Profile) : null;
}

export const saveProfile = (profile: Profile) => setJson(KEYS.profile, profile);
export const getPresets = () => getJson(KEYS.presets, DEFAULT_PRESETS);
export const savePresets = (presets: Presets) => setJson(KEYS.presets, presets);
export const getOptions = () => getJson(KEYS.options, DEFAULT_OPTIONS);
export const saveOptions = (options: CaptureOptions) => setJson(KEYS.options, options);
export const getLastLocation = () => getJson<Location>(KEYS.lastLocation, { room: null, shelf: null, row: null });
export const saveLastLocation = (location: Location) => setJson(KEYS.lastLocation, location);

// ---- Box sequence counter -------------------------------------------------

export async function getNextSequence(): Promise<number> {
    const { value } = await Preferences.get({ key: KEYS.nextSequence });
    return value ? Number(value) : 1;
}

/** Last sequence handed out (0 if none). */
export async function getLastIssued(): Promise<number> {
    return (await getNextSequence()) - 1;
}

let issuing: Promise<unknown> = Promise.resolve();

/**
 * Hands out the next sequence and persists the counter *before* returning,
 * so a crash can never make the phone reuse a code already written on a box.
 */
export function issueSequence(): Promise<number> {
    const result = issuing.then(async () => {
        const next = await getNextSequence();
        if (next > MAX_SEQUENCE) throw new Error('SEQUENCE_EXHAUSTED');
        await Preferences.set({ key: KEYS.nextSequence, value: String(next + 1) });
        return next;
    });
    issuing = result.catch(() => {});
    return result;
}

/** Admin only: e.g. after reinstalling the app, continue after the last sequence seen by the PC. */
export async function setNextSequence(next: number): Promise<void> {
    if (!Number.isInteger(next) || next < 1 || next > MAX_SEQUENCE) throw new Error('INVALID_SEQUENCE');
    await Preferences.set({ key: KEYS.nextSequence, value: String(next) });
}
