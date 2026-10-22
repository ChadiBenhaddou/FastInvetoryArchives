// Admin PIN: only a salted PBKDF2 hash is stored on the phone.

const ITERATIONS = 150_000;

function toHex(buffer: ArrayBuffer | Uint8Array): string {
    return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isValidPinFormat(pin: string): boolean {
    return /^\d{6,8}$/.test(pin);
}

export async function hashPin(pin: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
    const salt = saltHex
        ? Uint8Array.from(saltHex.match(/../g)!.map((h) => parseInt(h, 16)))
        : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
    return { hash: toHex(bits), salt: toHex(salt) };
}

export async function verifyPin(pin: string, hash: string, salt: string): Promise<boolean> {
    const computed = await hashPin(pin, salt);
    // Constant-time comparison.
    let diff = computed.hash.length ^ hash.length;
    for (let i = 0; i < Math.min(computed.hash.length, hash.length); i++) {
        diff |= computed.hash.charCodeAt(i) ^ hash.charCodeAt(i);
    }
    return diff === 0;
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
    return toHex(await crypto.subtle.digest('SHA-256', data as BufferSource));
}
