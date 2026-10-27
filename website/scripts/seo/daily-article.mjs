// One day of the publishing pipeline (run by .github/workflows/website-daily-article.yml):
//   quota → (research within budget) → topic + brief → article → quality gate (one retry) → decision.
// Writes the article (draft: false to publish, draft: true for the review pull request), the
// publication log and the daily summary; tells the workflow what to do through $GITHUB_OUTPUT.
//
//   mode=publish  → the workflow builds, commits to the default branch, Cloudflare Pages deploys
//   mode=review   → the workflow opens a pull request labelled needs-review
//   mode=skip     → nothing to publish today (no valuable topic, quota reached, budget exhausted)
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BLOG, RESEARCH, settings } from './config.mjs';
import { joinFrontmatter, loadPosts, sitePaths } from './content.mjs';
import { generateArticle } from './generate-article.mjs';
import { loadStore, saveStore } from './keyword-store.mjs';
import { chooseTopic, makeBrief } from './plan.mjs';
import { formatChecks, isLegalTopic, runGate } from './quality-gate.mjs';
import { AiBudgetExceeded, AiRefused } from './llm.mjs';

export const PUBLICATIONS = join(RESEARCH, 'publications.json');

export function loadPublications() {
    return existsSync(PUBLICATIONS) ? JSON.parse(readFileSync(PUBLICATIONS, 'utf8')) : [];
}

function output(values) {
    if (!process.env.GITHUB_OUTPUT) return;
    for (const [k, v] of Object.entries(values)) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
}

/** The whole decision, with injectable steps for tests. */
export async function runDay({ today = new Date().toISOString().slice(0, 10), generate = generateArticle, gate = runGate, research = null, write = true } = {}) {
    const publications = loadPublications();
    const doneToday = publications.filter((p) => p.date === today && ['publish', 'review'].includes(p.mode)).length;
    if (doneToday >= settings.maxArticlesPerDay) return { mode: 'skip', reason: `quota du jour atteint (${settings.maxArticlesPerDay})` };

    if (research) {
        try {
            await research();
        } catch (error) {
            console.error(`Recherche de mots-clés interrompue : ${error.message} (on continue avec la base existante)`);
        }
    }

    const store = loadStore();
    const posts = loadPosts();
    const topic = chooseTopic(store, posts);
    if (!topic) return { mode: 'skip', reason: 'aucun sujet utile : pas de publication de remplissage' };
    const brief = makeBrief(topic, today);
    const paths = sitePaths(posts);

    let article, result, feedback = null, cost = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            article = await generate(brief, { sitePaths: paths, posts, feedback });
        } catch (error) {
            if (error instanceof AiBudgetExceeded || error instanceof AiRefused) return { mode: 'skip', reason: error.message, brief };
            throw error;
        }
        cost += article.costUsd ?? 0;
        result = await gate(article, { posts, sitePaths: paths });
        if (result.pass) break;
        feedback = result.checks.filter((c) => !c.ok).map((c) => `- ${c.name} : ${c.detail}`).join('\n');
    }

    const legal = brief.requiresReview || isLegalTopic(article);
    const mode = result.pass && settings.autoPublish && !legal ? 'publish' : 'review';
    const reason = !result.pass ? 'porte qualité échouée deux fois' : legal ? 'sujet réglementaire : relecture humaine obligatoire' : !settings.autoPublish ? 'AUTO_PUBLISH=false' : 'porte qualité passée';
    article.data.draft = mode !== 'publish';

    const record = {
        date: today,
        slug: brief.slug,
        url: `/blog/${brief.slug}/`,
        primaryKeyword: brief.primaryKeyword,
        source: brief.source,
        offer: brief.offer,
        mode,
        reason,
        checks: result.checks,
        aiCostUsd: Math.round(cost * 10000) / 10000,
        model: article.model ?? null,
    };
    if (write) {
        writeFileSync(join(BLOG, `${brief.slug}.md`), joinFrontmatter(article.data, article.body), 'utf8');
        mkdirSync(RESEARCH, { recursive: true });
        writeFileSync(PUBLICATIONS, JSON.stringify([...publications, record], null, 2) + '\n');
        if (brief.keywordKey && store.keywords[brief.keywordKey]) {
            store.keywords[brief.keywordKey].status = mode === 'publish' ? 'publie' : 'redige';
            store.keywords[brief.keywordKey].articleUrl = record.url;
            saveStore(store);
        }
    }
    return { mode, reason, brief, article, result, record };
}

export function summary(day) {
    if (day.mode === 'skip') return `## Article du jour : aucun\n\n${day.reason}.\n`;
    const verb = day.mode === 'publish' ? 'publié automatiquement' : 'à relire (pull request `needs-review`)';
    return [
        `## Article du jour : ${verb}`,
        '',
        `**${day.article.data.title}** — \`${day.record.url}\``,
        '',
        `Mot-clé : ${day.brief.primaryKeyword} (${day.brief.source === 'keyword-research' ? `volume ${day.brief.searchVolume ?? 'inconnu'}` : 'calendrier éditorial'}) · offre : ${day.brief.offer} · coût IA : ${day.record.aiCostUsd} $`,
        `Décision : ${day.reason}.`,
        '',
        '### Porte qualité',
        '```',
        formatChecks(day.result.checks),
        '```',
        day.mode === 'publish' ? '\nPour retirer l’article : Actions → « website-unpublish » → slug ci-dessus.' : '',
    ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    let research = null;
    if (process.env.SEO_RESEARCH_DAILY === 'true') {
        const { runResearch } = await import('./research.mjs');
        const { DataForSeo } = await import('./dataforseo.mjs');
        research = async () => {
            const { store } = await runResearch({ estimate: false, arabic: false, serp: 2, seeds: null }, { client: new DataForSeo() });
            saveStore(store);
        };
    }
    const day = await runDay({ research });
    const text = summary(day);
    console.log(text);
    mkdirSync(RESEARCH, { recursive: true });
    writeFileSync(join(RESEARCH, 'daily-summary.md'), text + '\n');
    output({ mode: day.mode, slug: day.brief?.slug ?? '', title: (day.article?.data.title ?? '').replace(/\n/g, ' ') });
}
