import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetKeyCache, verifyAccess } from '../dashboard/server/access';
import { handleDispatch } from '../dashboard/server/dispatch';

const TEAM = 'equipe.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const b64url = (data: Uint8Array | string) =>
    Buffer.from(typeof data === 'string' ? data : data).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function keyPair() {
    const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
    return { pair, jwk };
}

async function token(privateKey: CryptoKey, payload: Record<string, unknown>, kid = 'k1') {
    const head = b64url(JSON.stringify({ alg: 'RS256', kid }));
    const body = b64url(JSON.stringify(payload));
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${head}.${body}`)));
    return `${head}.${body}.${b64url(sig)}`;
}

const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const req = (jwt?: string) => new Request('https://dash.test/', { headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {} });
const valid = () => ({ aud: [AUD], iss: `https://${TEAM}`, exp: Math.floor(Date.now() / 1000) + 600, email: 'Admin@Exemple.ma', sub: 'u1' });

describe('Cloudflare Access verification', () => {
    let keys: Awaited<ReturnType<typeof keyPair>>;
    let certs: ReturnType<typeof vi.fn>;
    beforeEach(async () => {
        resetKeyCache();
        keys = await keyPair();
        certs = vi.fn(async () => Response.json({ keys: [keys.jwk] }));
    });

    it('accepts a valid token and returns the identity', async () => {
        const id = await verifyAccess(req(await token(keys.pair.privateKey, valid())), env, certs as unknown as typeof fetch);
        expect(id.email).toBe('admin@exemple.ma');
        expect(certs).toHaveBeenCalledWith(`https://${TEAM}/cdn-cgi/access/certs`);
    });

    it('refuses: no token, forged signature, wrong audience, wrong issuer, expired, unknown key', async () => {
        const other = await keyPair();
        const f = certs as unknown as typeof fetch;
        await expect(verifyAccess(req(), env, f)).rejects.toThrow(/absent/);
        await expect(verifyAccess(req(await token(other.pair.privateKey, valid())), env, f)).rejects.toThrow(/signature/);
        await expect(verifyAccess(req(await token(keys.pair.privateKey, { ...valid(), aud: ['autre'] })), env, f)).rejects.toThrow(/audience/);
        await expect(verifyAccess(req(await token(keys.pair.privateKey, { ...valid(), iss: 'https://pirate.example' })), env, f)).rejects.toThrow(/émetteur/);
        await expect(verifyAccess(req(await token(keys.pair.privateKey, { ...valid(), exp: 1 })), env, f)).rejects.toThrow(/expiré/);
        await expect(verifyAccess(req(await token(keys.pair.privateKey, valid(), 'k9')), env, f)).rejects.toThrow(/inconnue/);
    });

    it('refuses everything when Access is not configured', async () => {
        await expect(verifyAccess(req('x.y.z'), {}, certs as unknown as typeof fetch)).rejects.toThrow(/non configuré/);
    });
});

describe('dashboard actions', () => {
    const denv = { DASHBOARD_ADMINS: 'admin@exemple.ma, autre@exemple.ma', GITHUB_DISPATCH_TOKEN: 'ghp_secret', GITHUB_REPOSITORY: 'org/repo' };
    const post = (body: unknown) => new Request('https://dash.test/api/dispatch', { method: 'POST', body: JSON.stringify(body) });
    const admin = { email: 'admin@exemple.ma', sub: 'u1' };
    const github = () => vi.fn(async () => new Response(null, { status: 204 }));

    it('starts the unpublish workflow with validated inputs; the token never leaves the server', async () => {
        const gh = github();
        const res = await handleDispatch(post({ action: 'unpublish', slug: 'ocr-documents-arabes-possibilites-limites', reason: 'erreur' }), denv, admin, gh as unknown as typeof fetch);
        expect(res.status).toBe(202);
        expect(JSON.stringify(res.body)).not.toContain('ghp_secret');
        const [url, init] = gh.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://api.github.com/repos/org/repo/actions/workflows/website-unpublish.yml/dispatches');
        expect(JSON.parse(init.body as string)).toEqual({ ref: 'main', inputs: { slug: 'ocr-documents-arabes-possibilites-limites', reason: 'erreur' } });
    });

    it('refuses non-admins, unknown actions and bad slugs', async () => {
        const gh = github();
        expect((await handleDispatch(post({ action: 'run-daily' }), denv, { email: 'visiteur@exemple.ma', sub: 'x' }, gh as unknown as typeof fetch)).status).toBe(403);
        expect((await handleDispatch(post({ action: 'rm -rf' }), denv, admin, gh as unknown as typeof fetch)).status).toBe(400);
        expect((await handleDispatch(post({ action: 'unpublish', slug: '../etc/passwd' }), denv, admin, gh as unknown as typeof fetch)).status).toBe(400);
        expect(gh).not.toHaveBeenCalled();
    });

    it('rate-limits each admin with KV', async () => {
        const store = new Map<string, string>();
        const kv = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v) } as unknown as KVNamespace;
        const statuses = [];
        for (let i = 0; i < 3; i++) statuses.push((await handleDispatch(post({ action: 'run-daily' }), { ...denv, DASHBOARD_KV: kv, DISPATCH_PER_HOUR: '2' }, admin, github() as unknown as typeof fetch)).status);
        expect(statuses).toEqual([202, 202, 429]);
    });
});
