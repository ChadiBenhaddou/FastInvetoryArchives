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

const REQUIRED = ['PUBLIC_SITE_URL', 'PUBLIC_ORG_NAME', 'PUBLIC_CONTACT_EMAIL', 'PUBLIC_PUBLISHER_NAME'];

export function missingProductionSettings() {
    return REQUIRED.filter((k) => !env[k] || env[k].includes('À COMPLÉTER'));
}

const value = (key, fallback = MISSING) => (env[key] && env[key].trim()) || fallback;

export const site = {
    url: value('PUBLIC_SITE_URL', 'http://localhost:4321').replace(/\/$/, ''),
    productName: 'Inventaire rapide des archives',
    orgName: value('PUBLIC_ORG_NAME'),
    // Optional details: shown only when set (legal notice, footer, structured data).
    legalForm: value('PUBLIC_ORG_LEGAL_FORM', ''),
    address: value('PUBLIC_ORG_ADDRESS', ''),
    city: value('PUBLIC_ORG_CITY', ''),
    rc: value('PUBLIC_ORG_RC', ''),
    ice: value('PUBLIC_ORG_ICE', ''),
    email: value('PUBLIC_CONTACT_EMAIL'),
    phone: value('PUBLIC_CONTACT_PHONE', ''),
    publisher: value('PUBLIC_PUBLISHER_NAME'),
    authorName: value('PUBLIC_AUTHOR_NAME', ''),
    cndpReference: value('PUBLIC_CNDP_REFERENCE', ''),
    turnstileSiteKey: value('PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA'), // Cloudflare's always-pass test key
    // Privacy-friendly, cookieless analytics: off unless a Cloudflare Web Analytics token is set.
    cfAnalyticsToken: value('PUBLIC_CF_ANALYTICS_TOKEN', ''),
    googleVerification: value('PUBLIC_GOOGLE_SITE_VERIFICATION', ''),
    locale: 'fr-MA',
};

/** True when a value is still a placeholder (shown with a visible marker locally, refused in production). */
export const isMissing = (v) => !v || v === MISSING;
