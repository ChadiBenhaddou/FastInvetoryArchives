// Box codes "A-0123-N". Specification: shared/BOX_CODE.md
// Must stay identical to backend/app/Support/BoxCode.php (both run shared/box-code-vectors.json).

/** 21 letters: the Latin alphabet minus the confusable O I S B Z. */
export const ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY';
const WEIGHTS = [13, 8, 4, 2, 1];
export const MAX_SEQUENCE = 9999;

export type InvalidReason = 'format' | 'device' | 'sequence' | 'checksum';

export class InvalidBoxCode extends Error {
    constructor(
        public readonly input: string,
        public readonly reason: InvalidReason,
    ) {
        super(`Invalid box code "${input}" (${reason})`);
    }
}

export function isValidDeviceLetter(letter: string): boolean {
    return letter.length === 1 && ALPHABET.includes(letter);
}

export function checkLetter(device: string, sequence: number): string {
    const digits = String(sequence).padStart(4, '0').split('').map(Number);
    const values = [ALPHABET.indexOf(device), ...digits];
    const sum = values.reduce((acc, value, i) => acc + WEIGHTS[i] * value, 0);
    return ALPHABET[sum % ALPHABET.length];
}

export function makeCode(device: string, sequence: number): string {
    device = device.toUpperCase();
    if (!isValidDeviceLetter(device)) throw new InvalidBoxCode(device, 'device');
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) {
        throw new InvalidBoxCode(String(sequence), 'sequence');
    }
    return `${device}-${String(sequence).padStart(4, '0')}-${checkLetter(device, sequence)}`;
}

/** "a 0123 n" / "A0123N" / "A–0123–N" → "A-0123-N" (structure only, no validation). */
export function normalize(input: string): string {
    const compact = input.trim().toUpperCase().replace(/[\s\-‐-―_]+/g, '');
    const m = compact.match(/^([A-Z])(\d{4})([A-Z])$/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : compact;
}

export function parse(input: string): { device: string; sequence: number; code: string } {
    const m = normalize(input).match(/^([A-Z])-(\d{4})-([A-Z])$/);
    if (!m) throw new InvalidBoxCode(input, 'format');
    const [, device, digits, check] = m;

    if (!isValidDeviceLetter(device)) throw new InvalidBoxCode(input, 'device');
    if (!ALPHABET.includes(check)) throw new InvalidBoxCode(input, 'format');
    const sequence = Number(digits);
    if (sequence < 1) throw new InvalidBoxCode(input, 'sequence');
    if (checkLetter(device, sequence) !== check) throw new InvalidBoxCode(input, 'checksum');

    return { device, sequence, code: `${device}-${digits}-${check}` };
}

export function isValid(input: string): boolean {
    try {
        parse(input);
        return true;
    } catch {
        return false;
    }
}
