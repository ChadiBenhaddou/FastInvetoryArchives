// Automated quality gate: an article is published only if every check passes.
//   schema · unique slug · no cannibalisation · length and headings · no repeated paragraph / stuffing ·
//   internal links resolve (≥ 2) + contextual CTA · external URLs respond and are on the allow-list ·
//   no unsourced statistic · independent AI review (facts, invented figures, legal claims, product claims).
// The production build with the new article is the last check, run by the workflow.
//
//   node scripts/seo/quality-gate.mjs src/content/blog/x.md [--no-ai] [--no-network]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ALLOWED_SOURCE_DOMAINS, DOCS, LEGAL_PATTERNS, settings } from './config.mjs';
import { validateFrontmatter } from './article-schema.mjs';
import { findCannibal, loadPosts, shingles, jaccard, sitePaths as listSitePaths, splitFrontmatter } from './content.mjs';
import { normalize } from './keyword-store.mjs';
import { callJson } from './llm.mjs';
import { join } from 'node:path';

const CTA_BY_OFFER = {
    inventaire: ['/demander-une-demonstration/', '/contact/', '/logiciel-inventaire-archives/'],
    'sur-mesure': ['/applications-sur-mesure/', '/contact/'],
};

export const REVIEW_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['pass', 'issues', 'summary'],
    properties: {
        pass: { type: 'boolean' },
        summary: { type: 'string' },
        issues: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'excerpt', 'reason'],
                properties: {
                    type: { type: 'string', enum: ['erreur-factuelle', 'chiffre-invente', 'citation-inventee', 'affirmation-juridique-non-sourcee', 'fonctionnalite-non-verifiee', 'sur-mesure-presente-comme-existant', 'autre'] },
                    excerpt: { type: 'string' },
                    reason: { type: 'string' },
                },
            },
        },
    },
};

const REVIEWER = `Tu es relecteur indépendant d'articles avant publication automatique, pour un site marocain sur la gestion
des archives et les applications sur mesure. Tu ne réécris rien : tu cherches ce qui interdit la publication.
Refuse (pass=false) dès qu'il y a au moins un de ces problèmes, avec l'extrait exact et la raison :
- erreur factuelle certaine ou très probable ;
- chiffre, pourcentage, statistique, date ou étude sans source citée ni présence dans la référence ;
- citation entre guillemets attribuée à quelqu'un sans source ;
- affirmation juridique (loi, décret, obligation, délai) absente des « Sources vérifiées » ou présentée comme un conseil juridique définitif ;
- fonctionnalité du logiciel absente des « Fonctionnalités vérifiées », ou contraire aux limites qui y sont listées ;
- application sur mesure présentée comme un produit existant ou une référence client réalisée.
Le style, la longueur et le référencement ne sont pas ton sujet. Si rien de tout cela : pass=true, issues vide.`;

const words = (text) => text.replace(/[#>*_`|[\]()-]/g, ' ').split(/\s+/).filter(Boolean);

/** Links of the Markdown body: [text](url). */
export const markdownLinks = (body) => [...body.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1]);

/** Sentences with a figure that looks like a statistic, without a link in the same paragraph. */
export function unsourcedStatistics(body) {
    const found = [];
    for (const paragraph of body.split(/\n\s*\n/)) {
        if (/\]\(https?:/.test(paragraph)) continue;
        const stat = paragraph.match(/[^.!?\n]*(\d+(?:[,.]\d+)?\s?%|\b(?:selon une|une étude|les études|d'après une enquête|statistiques? montrent)\b)[^.!?\n]*/i);
        if (stat) found.push(stat[0].trim().slice(0, 160));
    }
    return found;
}

async function urlResponds(url, fetchImpl) {
    for (const method of ['HEAD', 'GET']) {
        try {
            const res = await fetchImpl(url, { method, redirect: 'follow', signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'Mozilla/5.0 (verification de liens)' } });
            if (res.status < 400) return true;
            if (method === 'GET') return false;
        } catch {
            if (method === 'GET') return false;
        }
    }
    return false;
}

const onAllowList = (url) => {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return ALLOWED_SOURCE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
};

export function isLegalTopic(article) {
    const text = normalize(`${article.data.title} ${article.data.primaryKeyword} ${article.data.category}`);
    return article.data.category === 'reglementation-maroc' || LEGAL_PATTERNS.some((p) => p.test(text));
}

/**
 * @param {{data: object, body: string}} article
 * @param {object} ctx  posts (existing, excluding this one), sitePaths, fetchImpl, ai (false to skip), review (callJson)
 * @returns {Promise<{pass: boolean, checks: {name: string, ok: boolean, detail: string}[]}>}
 */
export async function runGate(article, { posts = loadPosts(), sitePaths = listSitePaths(), fetchImpl = fetch, ai = true, network = true, review = callJson } = {}) {
    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok, detail });
    const { data, body } = article;
    const others = posts.filter((p) => p.data.slug !== data.slug);

    const schemaProblems = validateFrontmatter(data);
    check('frontmatter valide', !schemaProblems.length, schemaProblems.join(' ; '));
    check('slug unique', !posts.some((p) => p.data.slug === data.slug && p.body.trim() !== body.trim()), data.slug);

    const cannibal = findCannibal(data, others);
    check('pas de cannibalisation', !cannibal, cannibal ? `${cannibal.reason} avec /blog/${cannibal.post.data.slug}/` : '');
    const dup = others.map((p) => ({ p, s: jaccard(shingles(body), shingles(p.body)) })).find(({ s }) => s > 0.2);
    check('contenu non dupliqué', !dup, dup ? `${(dup.s * 100).toFixed(0)} % de passages communs avec /blog/${dup.p.data.slug}/` : '');

    const count = words(body).length;
    const minWords = Number(process.env.SEO_MIN_WORDS ?? 650);
    check(`longueur utile (≥ ${minWords} mots)`, count >= minWords, `${count} mots`);
    const h2 = (body.match(/^## /gm) ?? []).length;
    check('structure : ≥ 3 sections ##, pas de #', h2 >= 3 && !/^# /m.test(body), `${h2} sections`);

    const paragraphs = body.split(/\n\s*\n/).map((p) => normalize(p)).filter((p) => p.length > 80);
    const repeated = paragraphs.filter((p, i) => paragraphs.indexOf(p) !== i);
    check('aucun paragraphe répété', !repeated.length, repeated[0]?.slice(0, 80) ?? '');
    const kw = normalize(data.primaryKeyword);
    const occurrences = normalize(body).split(kw).length - 1;
    check('pas de bourrage du mot-clé', occurrences <= Math.max(6, count / 120), `${occurrences} occurrences de « ${data.primaryKeyword} »`);

    const links = markdownLinks(body);
    const internal = [...new Set(links.filter((l) => l.startsWith('/')).map((l) => l.split('#')[0].split('?')[0]))];
    const broken = internal.filter((l) => !sitePaths.includes(l));
    check('liens internes valides', !broken.length, broken.join(', '));
    check('≥ 2 liens internes', internal.length >= 2, `${internal.length} liens`);
    // A product or custom-development page, or a sub-page of it, is a contextual call to action.
    check("appel à l'action adapté", internal.some((l) => (CTA_BY_OFFER[data.offer] ?? []).some((cta) => l.startsWith(cta))), `offre ${data.offer}`);

    const external = [...new Set([...links.filter((l) => /^https?:/.test(l)), ...(data.sources ?? []).map((s) => s.url)])];
    const offList = external.filter((u) => !onAllowList(u));
    check('sources sur la liste blanche', !offList.length, offList.join(', '));
    if (network) {
        const dead = [];
        for (const url of external) if (!(await urlResponds(url, fetchImpl))) dead.push(url);
        check('sources joignables', !dead.length, dead.join(', '));
    }
    const legal = isLegalTopic(article) || /\b(loi n°|dahir|décret n°|article \d+ de la loi)/i.test(body);
    check('faits réglementaires sourcés', !legal || external.some(onAllowList), legal ? 'sujet réglementaire' : '');
    const stats = unsourcedStatistics(body);
    check('aucune statistique sans source', !stats.length, stats.join(' | '));

    if (ai) {
        const reference = `# Fonctionnalités vérifiées\n\n${readFileSync(join(DOCS, 'FEATURES-VERIFIED.md'), 'utf8')}\n\n# Sources vérifiées\n\n${readFileSync(join(DOCS, 'SOURCES-VERIFIEES.md'), 'utf8')}`;
        try {
            const { data: verdict } = await review({
                model: settings.reviewerModel,
                purpose: 'reviewer',
                instructions: REVIEWER,
                reference,
                input: `Article à relire :\n\n# ${data.title}\n\n${body}\n\nSources déclarées : ${JSON.stringify(data.sources ?? [])}`,
                schema: REVIEW_SCHEMA,
                effort: 'high',
                maxTokens: 16000,
            });
            check('relecture IA indépendante', verdict.pass && !verdict.issues.length,
                verdict.issues.map((i) => `${i.type} : « ${i.excerpt.slice(0, 100)} » — ${i.reason}`).join(' | ') || verdict.summary);
        } catch (error) {
            check('relecture IA indépendante', false, `relecture impossible : ${error.message}`);
        }
    }
    return { pass: checks.every((c) => c.ok), checks };
}

export const formatChecks = (checks) => checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`).join('\n');

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const file = process.argv[2];
    if (!file) {
        console.error('usage : node scripts/seo/quality-gate.mjs <article.md> [--no-ai] [--no-network]');
        process.exit(2);
    }
    const article = splitFrontmatter(readFileSync(file, 'utf8'));
    const result = await runGate(article, { ai: !process.argv.includes('--no-ai'), network: !process.argv.includes('--no-network') });
    console.log(formatChecks(result.checks));
    console.log(result.pass ? '\nPORTE QUALITÉ : OK' : '\nPORTE QUALITÉ : ÉCHEC');
    process.exit(result.pass ? 0 : 1);
}
