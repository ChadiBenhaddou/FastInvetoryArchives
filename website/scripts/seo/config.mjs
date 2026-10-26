// Settings of the research and publishing automation. Everything that costs money or publishes is
// controlled by environment variables (GitHub Actions secrets/variables); safe defaults otherwise.
import { resolve } from 'node:path';

export const WEBSITE = resolve(import.meta.dirname, '../..');
export const RESEARCH = resolve(WEBSITE, 'research');
export const BLOG = resolve(WEBSITE, 'src/content/blog');
export const DOCS = resolve(WEBSITE, 'docs');

const env = process.env;
const bool = (v, fallback) => (v === undefined || v === '' ? fallback : ['1', 'true', 'yes', 'oui'].includes(String(v).toLowerCase()));
const num = (v, fallback) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));

export const settings = {
    // Paid API calls only when SEO_LIVE=true (CI sets it); locally everything is a dry run.
    live: bool(env.SEO_LIVE, false),
    dailyBudgetUsd: num(env.SEO_DAILY_BUDGET_USD, 1),
    monthlyBudgetUsd: num(env.SEO_MONTHLY_BUDGET_USD, 15),
    // Ceiling for an endpoint never called before (its real cost is then learnt from the response).
    unknownCallMaxUsd: num(env.SEO_UNKNOWN_CALL_MAX_USD, 0.2),
    maxRequestsPerRun: num(env.SEO_MAX_REQUESTS_PER_RUN, 12),
    cacheDays: num(env.SEO_CACHE_DAYS, 30),
    staleDays: num(env.SEO_STALE_DAYS, 90),
    autoPublish: bool(env.AUTO_PUBLISH, true),
    maxArticlesPerDay: num(env.MAX_ARTICLES_PER_DAY, 1),
    publishHourMorocco: num(env.PUBLISH_HOUR, 9),
    writerModel: env.SEO_WRITER_MODEL || 'claude-opus-5-5',
    reviewerModel: env.SEO_REVIEWER_MODEL || 'claude-opus-5-5',
    authorName: env.SEO_AUTHOR_NAME || 'Équipe Inventaire rapide des archives',
};

/** Morocco by name: DataForSEO resolves it; no location code is guessed. */
export const MARKETS = [
    { country: 'MA', location_name: 'Morocco', language_code: 'fr', language: 'fr' },
    { country: 'MA', location_name: 'Morocco', language_code: 'ar', language: 'ar' },
];

/** Seed keywords (§7 of the brief): hypotheses to verify with real data, not volumes. */
export const SEEDS = {
    fr: [
        'inventaire des archives', 'logiciel de gestion des archives', "logiciel d'inventaire des archives",
        'traitement des archives', 'gestion des archives administratives', 'classement des archives',
        'plan de classement documentaire', 'tableau de gestion des archives', 'durée de conservation des documents',
        'récolement des archives', 'archivage physique et numérique', 'numérisation des archives', 'ocr arabe',
        'reconnaissance de texte arabe', 'externalisation des archives', "prestataire d'archivage",
        "logiciel d'archivage", 'archivage sans cloud', 'loi 69-99 archives',
        'développement application sur mesure', 'développement application mobile android', 'application de gestion sur mesure',
        'logiciel sur mesure administration', 'application hors ligne', 'application de collecte de données terrain',
        'solution ocr', 'extraction automatique de données documents', 'intelligence artificielle locale',
        'digitalisation des processus administratifs', 'transformation numérique administration',
    ],
    ar: ['أرشيف', 'تدبير الأرشيف', 'جرد الأرشيف', 'رقمنة الأرشيف', 'برنامج أرشفة', 'التعرف الضوئي على الحروف العربية'],
};

/** Clusters (§7) with detection patterns on the normalised keyword, and the offer they serve. */
export const CLUSTERS = [
    { key: 'inventaire-recolement', offer: 'inventaire', patterns: [/inventaire/, /recolement/, /جرد/] },
    { key: 'classement-description', offer: 'inventaire', patterns: [/plan de classement/, /classement/, /description/, /cotation/] },
    { key: 'conservation-elimination', offer: 'inventaire', patterns: [/conservation/, /elimination/, /tableau de gestion/, /duree/] },
    { key: 'reglementation-maroc', offer: 'inventaire', patterns: [/\bloi\b/, /69-99/, /reglement/, /obligation/, /cndp/, /09-08/, /قانون/] },
    { key: 'numerisation-ocr-recherche', offer: 'inventaire', patterns: [/ocr/, /numeris/, /scan/, /reconnaissance/, /recherche documentaire/, /رقمنة/, /التعرف/] },
    { key: 'archivage-physique-numerique', offer: 'inventaire', patterns: [/archivage/, /physique/, /numerique/, /أرشفة/] },
    { key: 'organisation-couts', offer: 'inventaire', patterns: [/externalis/, /prestataire/, /cout/, /prix/, /tarif/] },
    { key: 'archives-administratives', offer: 'inventaire', patterns: [/archives administratives/, /administration/, /archives/, /أرشيف/] },
    { key: 'logiciels-outils', offer: 'inventaire', patterns: [/logiciel/, /outil/, /ged/, /برنامج/] },
    { key: 'applications-sur-mesure', offer: 'sur-mesure', patterns: [/sur mesure/, /application/, /developpement/, /hors ligne/, /collecte/, /intelligence artificielle/, /extraction/] },
    { key: 'transformation-numerique', offer: 'sur-mesure', patterns: [/transformation/, /digitalis/, /dematerialis/] },
];

/** Topics whose main subject is the law: never published automatically (review pull request). */
export const LEGAL_PATTERNS = [/\bloi\b/, /69-99/, /09-08/, /reglement/, /obligation legale/, /duree.* de conservation/, /delai.* de conservation/, /cndp/, /decret/, /قانون/];

/** Domains accepted as sources for factual or regulatory claims in automated articles. */
export const ALLOWED_SOURCE_DOMAINS = [
    'archivesdumaroc.ma', 'sgg.gov.ma', 'cndp.ma', 'mjcc.gov.ma', 'maroc.ma', 'chambredesrepresentants.ma',
    'wipo.int', 'github.com', 'docs.dataforseo.com',
];
