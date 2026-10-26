import { describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { handleLead, validate } from '../server/lead';

/** Minimal D1 on a real in-memory SQLite (node:sqlite): prepare/bind/run/first/exec. */
function fakeD1() {
    const db = new DatabaseSync(':memory:');
    const d1 = {
        exec: async (sql: string) => db.exec(sql),
        prepare: (sql: string) => {
            let args: unknown[] = [];
            const stmt = {
                bind: (...a: unknown[]) => ((args = a), stmt),
                run: async () => {
                    const r = db.prepare(sql).run(...(args as never[]));
                    return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } };
                },
                first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
            };
            return stmt;
        },
    };
    return { d1: d1 as unknown as D1Database, db };
}

const valid = {
    type: 'demonstration', nom: 'Amina Test', email: 'amina@exemple.ma', organisation: 'Commune test',
    type_organisation: 'Collectivité territoriale', ville: 'Rabat', langues: 'Arabe et français', delai: '', budget: '',
    consentement: 'oui', 'cf-turnstile-response': 'token-ok',
};

function request(fields: Record<string, string>, ip = '203.0.113.7') {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    return new Request('https://site.test/api/lead', { method: 'POST', body, headers: { 'CF-Connecting-IP': ip } });
}

/** fetch double: Turnstile answers `turnstileOk`, Resend answers `emailOk`. */
function fetchDouble({ turnstileOk = true, emailOk = true } = {}) {
    return vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes('turnstile')) return Response.json({ success: turnstileOk });
        if (u.includes('resend')) return new Response('{}', { status: emailOk ? 200 : 500 });
        throw new Error(`unexpected fetch ${u}`);
    }) as unknown as typeof fetch;
}

const env = (extra = {}) => ({ TURNSTILE_SECRET_KEY: 'secret', LEADS_IP_SALT: 'salt', ...extra });

describe('validation', () => {
    it('accepts a complete demo request', () => {
        const form = new FormData();
        for (const [k, v] of Object.entries(valid)) form.set(k, v);
        expect(validate(form).organisation).toBe('Commune test');
    });

    it('refuses missing consent, bad e-mail, unknown choices', () => {
        const form = new FormData();
        for (const [k, v] of Object.entries({ ...valid, consentement: '', email: 'pas-un-email', type_organisation: 'X' })) form.set(k, v);
        expect(() => validate(form)).toThrow(/consentement manquant.*|email invalide/);
    });

    it('requires a description for a custom project', () => {
        const form = new FormData();
        for (const [k, v] of Object.entries({ ...valid, type: 'sur-mesure' })) form.set(k, v);
        expect(() => validate(form)).toThrow(/description du besoin/);
    });
});

describe('handleLead', () => {
    it('stores a valid request in D1 with a hashed IP, never the IP itself', async () => {
        const { d1, db } = fakeD1();
        const outcome = await handleLead(request(valid), env({ LEADS_DB: d1 }), fetchDouble());
        expect(outcome).toEqual({ status: 200, ok: true });
        const row = db.prepare('SELECT * FROM leads').get() as Record<string, string>;
        expect(row.email).toBe('amina@exemple.ma');
        expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(row)).not.toContain('203.0.113.7');
    });

    it('refuses when no destination is configured (503), instead of dropping requests', async () => {
        const outcome = await handleLead(request(valid), env(), fetchDouble());
        expect(outcome.status).toBe(503);
    });

    it('rejects a failed Turnstile check', async () => {
        const { d1, db } = fakeD1();
        const outcome = await handleLead(request(valid), env({ LEADS_DB: d1 }), fetchDouble({ turnstileOk: false }));
        expect(outcome.status).toBe(400);
        expect(() => db.prepare('SELECT count(*) FROM leads').get()).toThrow(); // table never created
    });

    it('pretends success to a bot that fills the honeypot, and stores nothing', async () => {
        const { d1, db } = fakeD1();
        const fetchImpl = fetchDouble();
        const outcome = await handleLead(request({ ...valid, site_web: 'http://spam' }), env({ LEADS_DB: d1 }), fetchImpl);
        expect(outcome.ok).toBe(true);
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(() => db.prepare('SELECT count(*) FROM leads').get()).toThrow();
    });

    it('rate-limits one connection (5 per hour by default)', async () => {
        const { d1 } = fakeD1();
        const results = [];
        for (let i = 0; i < 6; i++) results.push((await handleLead(request(valid), env({ LEADS_DB: d1 }), fetchDouble())).status);
        expect(results).toEqual([200, 200, 200, 200, 200, 429]);
        expect((await handleLead(request(valid, '198.51.100.9'), env({ LEADS_DB: d1 }), fetchDouble())).status).toBe(200);
    });

    it('keeps the request in D1 when the e-mail fails', async () => {
        const { d1, db } = fakeD1();
        const outcome = await handleLead(request(valid), env({ LEADS_DB: d1, RESEND_API_KEY: 'k', LEADS_TO_EMAIL: 'a@b.ma', LEADS_FROM_EMAIL: 'site@b.ma' }), fetchDouble({ emailOk: false }));
        expect(outcome.ok).toBe(true);
        expect(db.prepare('SELECT emailed FROM leads').get()).toEqual({ emailed: 0 });
    });

    it('fails when e-mail is the only destination and it fails', async () => {
        const outcome = await handleLead(request(valid), env({ RESEND_API_KEY: 'k', LEADS_TO_EMAIL: 'a@b.ma', LEADS_FROM_EMAIL: 'site@b.ma' }), fetchDouble({ emailOk: false }));
        expect(outcome.status).toBe(502);
    });

    it('deletes requests older than the announced retention', async () => {
        const { d1, db } = fakeD1();
        await handleLead(request(valid), env({ LEADS_DB: d1 }), fetchDouble(), new Date('2024-01-01T00:00:00Z'));
        await handleLead(request(valid, '198.51.100.1'), env({ LEADS_DB: d1, PUBLIC_LEAD_RETENTION_MONTHS: '24' }), fetchDouble(), new Date('2026-10-26T00:00:00Z'));
        expect((db.prepare('SELECT count(*) AS n FROM leads').get() as { n: number }).n).toBe(1);
    });
});
