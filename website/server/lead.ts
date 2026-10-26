// Lead form handler (demo, quote/pilot, custom project). Pure function of the request and the
// environment so it can be unit-tested; functions/api/lead.ts binds it to POST /api/lead.
//
// Destinations: D1 (binding LEADS_DB) and/or e-mail through Resend (RESEND_API_KEY + LEADS_TO_EMAIL +
// LEADS_FROM_EMAIL). At least one must be configured, otherwise the request is refused (503) — a form
// that pretends to work while dropping requests would be worse than an error.

export interface LeadEnv {
    LEADS_DB?: D1Database;
    TURNSTILE_SECRET_KEY?: string;
    RESEND_API_KEY?: string;
    LEADS_TO_EMAIL?: string;
    LEADS_FROM_EMAIL?: string;
    LEADS_IP_SALT?: string;
    PUBLIC_LEAD_RETENTION_MONTHS?: string;
    LEADS_RATE_LIMIT_PER_HOUR?: string;
}

type Fetch = typeof fetch;

export const TYPES = ['demonstration', 'devis', 'sur-mesure'] as const;
const ORG_TYPES = ['Administration publique', 'Collectivité territoriale', 'Établissement public', 'Entreprise privée', 'Cabinet ou prestataire d’archivage', 'Autre'];
const LANGUAGES = ['', 'Arabe et français', 'Surtout en arabe', 'Surtout en français', 'Autre'];
const DELAYS = ['', 'Moins de 3 mois', '3 à 6 mois', 'Plus de 6 mois', 'Pas encore défini'];
const BUDGETS = ['', 'Moins de 100 000 MAD', '100 000 à 300 000 MAD', '300 000 à 1 000 000 MAD', 'Plus de 1 000 000 MAD'];

// name → [max length, required]
const TEXT_FIELDS: Record<string, [number, boolean]> = {
    nom: [120, true], email: [160, true], organisation: [160, true], telephone: [30, false], ville: [80, true],
    volume: [120, false], besoin: [4000, false], message: [2000, false],
};

export interface Lead {
    type: (typeof TYPES)[number];
    nom: string; email: string; organisation: string; telephone: string; type_organisation: string; ville: string;
    volume: string; langues: string; besoin: string; delai: string; budget: string; message: string;
}

export class LeadError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

const clean = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : '');

/** Server-side validation: never trust the browser's. Returns the lead or throws a 400 LeadError. */
export function validate(form: FormData): Lead {
    const errors: string[] = [];
    const out: Record<string, string> = {};
    for (const [name, [max, required]] of Object.entries(TEXT_FIELDS)) {
        const value = clean(form.get(name));
        if (required && !value) errors.push(`${name} manquant`);
        if (value.length > max) errors.push(`${name} trop long`);
        out[name] = value;
    }
    const choice = (name: string, allowed: readonly string[]) => {
        const value = clean(form.get(name));
        if (!allowed.includes(value)) errors.push(`${name} invalide`);
        return value;
    };
    const type = choice('type', TYPES) as Lead['type'];
    out.type_organisation = choice('type_organisation', ORG_TYPES);
    out.langues = choice('langues', LANGUAGES);
    out.delai = choice('delai', DELAYS);
    out.budget = choice('budget', BUDGETS);
    if (out.email && !/^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i.test(out.email)) errors.push('email invalide');
    if (out.telephone && !/^[+()\d\s.-]{6,30}$/.test(out.telephone)) errors.push('téléphone invalide');
    if (clean(form.get('consentement')) !== 'oui') errors.push('consentement manquant');
    if (type === 'sur-mesure' && !out.besoin && !out.message) errors.push('description du besoin manquante');
    if (errors.length) throw new LeadError(400, `Formulaire incomplet ou invalide (${errors.join(', ')}).`);
    return { type, ...out } as Lead;
}

async function sha256(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyTurnstile(token: string, ip: string, secret: string | undefined, fetchImpl: Fetch): Promise<boolean> {
    if (!secret) throw new LeadError(503, 'Protection anti-robot non configurée (TURNSTILE_SECRET_KEY).');
    if (!token) return false;
    const body = new FormData();
    body.set('secret', secret);
    body.set('response', token);
    if (ip) body.set('remoteip', ip);
    const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean };
    return data.success === true;
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, type TEXT NOT NULL, nom TEXT NOT NULL,
    email TEXT NOT NULL, organisation TEXT NOT NULL, telephone TEXT, type_organisation TEXT, ville TEXT,
    volume TEXT, langues TEXT, besoin TEXT, delai TEXT, budget TEXT, message TEXT, consent_at TEXT NOT NULL,
    ip_hash TEXT NOT NULL, emailed INTEGER NOT NULL DEFAULT 0)`;

async function rateLimited(db: D1Database, ipHash: string, perHour: number): Promise<boolean> {
    const since = new Date(Date.now() - 3600_000).toISOString();
    const row = await db.prepare('SELECT count(*) AS n FROM leads WHERE ip_hash = ? AND created_at > ?').bind(ipHash, since).first<{ n: number }>();
    return (row?.n ?? 0) >= perHour;
}

function emailText(lead: Lead): string {
    const label = { demonstration: 'Démonstration du logiciel', devis: 'Devis ou pilote', 'sur-mesure': 'Projet sur mesure' }[lead.type];
    const rows: [string, string][] = [
        ['Demande', label], ['Nom', lead.nom], ['E-mail', lead.email], ['Organisation', lead.organisation],
        ['Type', lead.type_organisation], ['Ville', lead.ville], ['Téléphone', lead.telephone],
        ['Volume', lead.volume], ['Langues', lead.langues], ['Besoin', lead.besoin], ['Délai', lead.delai],
        ['Budget', lead.budget], ['Message', lead.message],
    ];
    return rows.filter(([, v]) => v).map(([k, v]) => `${k} : ${v}`).join('\n');
}

async function sendEmail(env: LeadEnv, lead: Lead, fetchImpl: Fetch): Promise<boolean> {
    if (!env.RESEND_API_KEY || !env.LEADS_TO_EMAIL || !env.LEADS_FROM_EMAIL) return false;
    const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: env.LEADS_FROM_EMAIL,
            to: env.LEADS_TO_EMAIL.split(',').map((s) => s.trim()),
            reply_to: lead.email,
            subject: `[Site] ${lead.type === 'sur-mesure' ? 'Projet sur mesure' : lead.type === 'devis' ? 'Devis / pilote' : 'Démonstration'} — ${lead.organisation}`,
            text: emailText(lead),
        }),
    });
    if (!res.ok) throw new LeadError(502, 'Envoi de l’e-mail impossible pour le moment.');
    return true;
}

export interface Outcome { status: number; ok: boolean; error?: string }

export async function handleLead(request: Request, env: LeadEnv, fetchImpl: Fetch = fetch, now = new Date()): Promise<Outcome> {
    try {
        if (!env.LEADS_DB && !(env.RESEND_API_KEY && env.LEADS_TO_EMAIL && env.LEADS_FROM_EMAIL)) {
            throw new LeadError(503, 'Le formulaire n’est pas encore configuré (destination des demandes).');
        }
        const length = Number(request.headers.get('content-length') ?? 0);
        if (length > 64_000) throw new LeadError(413, 'Demande trop volumineuse.');
        const form = await request.formData().catch(() => {
            throw new LeadError(400, 'Formulaire illisible.');
        });
        // Honeypot filled: a bot. Pretend success, store nothing.
        if (clean(form.get('site_web'))) return { status: 200, ok: true };

        const ip = request.headers.get('CF-Connecting-IP') ?? '';
        if (!(await verifyTurnstile(clean(form.get('cf-turnstile-response')), ip, env.TURNSTILE_SECRET_KEY, fetchImpl))) {
            throw new LeadError(400, 'Vérification anti-robot échouée : rechargez la page et réessayez.');
        }
        const lead = validate(form);
        const ipHash = await sha256(`${env.LEADS_IP_SALT ?? 'inventaire-archives'}|${ip}`);

        if (env.LEADS_DB) {
            await env.LEADS_DB.exec(SCHEMA.replace(/\n\s*/g, ' '));
            if (await rateLimited(env.LEADS_DB, ipHash, Number(env.LEADS_RATE_LIMIT_PER_HOUR ?? 5))) {
                throw new LeadError(429, 'Trop de demandes envoyées depuis cette connexion : réessayez dans une heure.');
            }
        }
        // Stored first: an e-mail that fails must not lose the request.
        let id: number | null = null;
        if (env.LEADS_DB) {
            const stamp = now.toISOString();
            const inserted = await env.LEADS_DB.prepare(
                `INSERT INTO leads (created_at, type, nom, email, organisation, telephone, type_organisation, ville, volume, langues, besoin, delai, budget, message, consent_at, ip_hash)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).bind(stamp, lead.type, lead.nom, lead.email, lead.organisation, lead.telephone, lead.type_organisation, lead.ville,
                lead.volume, lead.langues, lead.besoin, lead.delai, lead.budget, lead.message, stamp, ipHash).run();
            id = Number(inserted.meta?.last_row_id ?? 0) || null;
            // Retention announced in the privacy policy: older requests are deleted.
            const months = Number(env.PUBLIC_LEAD_RETENTION_MONTHS ?? 24);
            const limit = new Date(now);
            limit.setMonth(limit.getMonth() - months);
            await env.LEADS_DB.prepare('DELETE FROM leads WHERE created_at < ?').bind(limit.toISOString()).run();
        }
        try {
            if ((await sendEmail(env, lead, fetchImpl)) && env.LEADS_DB && id) {
                await env.LEADS_DB.prepare('UPDATE leads SET emailed = 1 WHERE id = ?').bind(id).run();
            }
        } catch (error) {
            if (!env.LEADS_DB) throw error; // e-mail was the only destination
            console.error('lead e-mail', error); // stored anyway: visible in D1
        }
        return { status: 200, ok: true };
    } catch (error) {
        if (error instanceof LeadError) return { status: error.status, ok: false, error: error.message };
        console.error('lead', error);
        return { status: 500, ok: false, error: 'Erreur interne : réessayez plus tard.' };
    }
}
