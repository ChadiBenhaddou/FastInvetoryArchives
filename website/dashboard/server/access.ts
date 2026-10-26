// Cloudflare Access, checked again on the server: every request must carry a valid Access JWT
// (Cf-Access-Jwt-Assertion) signed by the team's keys, for this application's audience, not expired.
// If Access were misconfigured or bypassed (direct *.pages.dev URL), the dashboard still refuses.

export interface AccessEnv {
    ACCESS_TEAM_DOMAIN?: string; // e.g. "monequipe.cloudflareaccess.com"
    ACCESS_AUD?: string; // Application Audience (AUD) tag of the Access application
}

export interface AccessIdentity { email: string; sub: string }

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

type Jwk = JsonWebKey & { kid: string };
let certCache: { at: number; keys: Jwk[] } | null = null;

async function teamKeys(teamDomain: string, fetchImpl: typeof fetch): Promise<Jwk[]> {
    if (certCache && Date.now() - certCache.at < 3600_000) return certCache.keys;
    const res = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error(`certificats Access indisponibles (${res.status})`);
    const { keys } = (await res.json()) as { keys: Jwk[] };
    certCache = { at: Date.now(), keys };
    return keys;
}

export function resetKeyCache() {
    certCache = null;
}

export async function verifyAccess(request: Request, env: AccessEnv, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<AccessIdentity> {
    if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) throw new Error('Cloudflare Access non configuré (ACCESS_TEAM_DOMAIN, ACCESS_AUD)');
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token) throw new Error('jeton Access absent');
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('jeton Access mal formé');
    const header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
    if (header.alg !== 'RS256') throw new Error('algorithme refusé');
    const jwk = (await teamKeys(env.ACCESS_TEAM_DOMAIN, fetchImpl)).find((k) => k.kid === header.kid);
    if (!jwk) throw new Error('clé de signature inconnue');
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) throw new Error('signature invalide');
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) throw new Error('audience invalide');
    if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) throw new Error('émetteur invalide');
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < now) throw new Error('jeton expiré');
    if (typeof payload.email !== 'string') throw new Error('identité sans e-mail');
    return { email: payload.email.toLowerCase(), sub: payload.sub };
}
