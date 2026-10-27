// Site identity and environment, read once at build time (static output: process.env is the
// Cloudflare Pages build environment). Nothing here is invented: company details come from the
// PUBLIC_* variables (see .env.example). In production the build fails while they are missing.

const env = process.env;
const MISSING = '[À COMPLÉTER]';

/** production | preview | development. Cloudflare Pages sets CF_PAGES_BRANCH on every build. */
export function siteEnv() {
    if (env.SITE_ENV) return env.SITE_ENV;
    if (!env.CF_PAGES) return 'development';
    return env.CF_PAGES_BRANCH === (env.PRODUCTION_BRANCH || 'main') ? 'production' : 'preview';
}

export const isProduction = siteEnv() === 'production';

const REQUIRED = ['PUBLIC_SITE_URL', 'PUBLIC_PUBLISHER_NAME'];
const set = (k) => env[k] && env[k].trim() && !env[k].includes('À COMPLÉTER');

export function missingProductionSettings() {
    const missing = REQUIRED.filter((k) => !set(k));
    if (!set('PUBLIC_CONTACT_PHONE') && !set('PUBLIC_CONTACT_EMAIL')) missing.push('PUBLIC_CONTACT_PHONE ou PUBLIC_CONTACT_EMAIL');
    return missing;
}

const value = (key, fallback = MISSING) => (env[key] && env[key].trim()) || fallback;

/** Moroccan numbers: "0656096336" → international "212656096336" (tel: and WhatsApp links). */
export function internationalPhone(raw) {
    const digits = (raw || '').replace(/\D/g, '');
    if (/^0[5-7]\d{8}$/.test(digits)) return `212${digits.slice(1)}`;
    if (digits.startsWith('00')) return digits.slice(2);
    return digits;
}

/** "0656096336" → "06 56 09 63 36"; other formats are shown as written. */
export function displayPhone(raw) {
    const digits = (raw || '').replace(/\D/g, '');
    if (/^0\d{9}$/.test(digits)) return digits.replace(/(\d{2})(?=\d)/g, '$1 ');
    return (raw || '').trim();
}

const phoneRaw = value('PUBLIC_CONTACT_PHONE', '');
const publisher = value('PUBLIC_PUBLISHER_NAME');

export const site = {
    url: value('PUBLIC_SITE_URL', 'http://localhost:4321').replace(/\/$/, ''),
    productName: 'Inventaire rapide des archives',
    // Without a company, the site is published in the name of the person responsible for it.
    orgName: value('PUBLIC_ORG_NAME', publisher),
    // Optional details: shown only when set (legal notice, footer, structured data).
    legalForm: value('PUBLIC_ORG_LEGAL_FORM', ''),
    address: value('PUBLIC_ORG_ADDRESS', ''),
    city: value('PUBLIC_ORG_CITY', ''),
    rc: value('PUBLIC_ORG_RC', ''),
    ice: value('PUBLIC_ORG_ICE', ''),
    // Contact: phone (and WhatsApp unless PUBLIC_WHATSAPP=false) and/or e-mail; the site has no form
    // and collects no personal data itself.
    email: value('PUBLIC_CONTACT_EMAIL', ''),
    phone: displayPhone(phoneRaw),
    phoneIntl: internationalPhone(phoneRaw),
    whatsapp: phoneRaw && env.PUBLIC_WHATSAPP !== 'false' ? internationalPhone(phoneRaw) : '',
    publisher,
    authorName: value('PUBLIC_AUTHOR_NAME', ''),
    // Privacy-friendly, cookieless analytics: off unless a Cloudflare Web Analytics token is set.
    cfAnalyticsToken: value('PUBLIC_CF_ANALYTICS_TOKEN', ''),
    googleVerification: value('PUBLIC_GOOGLE_SITE_VERIFICATION', ''),
    locale: 'fr-MA',
};

/** True when a value is still a placeholder (shown with a visible marker locally, refused in production). */
export const isMissing = (v) => !v || v === MISSING;
