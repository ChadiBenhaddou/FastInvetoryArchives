// Builds the private SEO dashboard (separate Cloudflare Pages project, behind Cloudflare Access):
// dashboard/dist/ = the static app + data.json computed from research/ and the articles.
// Never part of the public site's output.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RESEARCH, settings } from '../scripts/seo/config.mjs';
import { jaccard, loadPosts, topicTokens } from '../scripts/seo/content.mjs';
import { classifyByRules, isStale, loadStore } from '../scripts/seo/keyword-store.mjs';
import { CATEGORIES } from '../scripts/seo/article-schema.mjs';

const HERE = import.meta.dirname;
const OUT = resolve(HERE, 'dist');
const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);

export function buildData() {
    const store = loadStore();
    const posts = loadPosts();
    const keywords = Object.entries(store.keywords).map(([key, r]) => {
        const c = r.classification ?? classifyByRules(r);
        return {
            key, keyword: r.keyword, language: r.language, status: r.status,
            volume: r.metrics.searchVolume, difficulty: r.metrics.difficulty, competition: r.metrics.competitionIndex, cpc: r.metrics.cpc,
            cluster: c.cluster, offer: c.offer, intent: c.intent, legal: c.legal, classifiedBy: c.by,
            sources: [...new Set(Object.values(r.provenance).map((p) => p.source))],
            retrievedAt: Object.values(r.provenance).map((p) => p.retrievedAt).sort()[0] ?? null,
            stale: isStale(r),
            competitors: (r.serp?.results ?? []).slice(0, 5).map((s) => ({ rank: s.rank, url: s.url, domain: s.domain })),
            articleUrl: r.articleUrl, brief: r.brief,
        };
    });
    const articles = posts.map((p) => ({ slug: p.data.slug, title: p.data.title, category: p.data.category, offer: p.data.offer, primaryKeyword: p.data.primaryKeyword, secondaryKeywords: p.data.secondaryKeywords ?? [], draft: !!p.data.draft, pubDate: String(p.data.pubDate), updatedDate: p.data.updatedDate ? String(p.data.updatedDate) : null }));
    // Pairs of articles targeting nearly the same topic: candidates for merging or re-targeting.
    const cannibalisation = [];
    for (let i = 0; i < posts.length; i++) {
        for (let j = i + 1; j < posts.length; j++) {
            const s = jaccard(topicTokens(posts[i].data), topicTokens(posts[j].data));
            if (s >= 0.35) cannibalisation.push({ a: posts[i].data.slug, b: posts[j].data.slug, similarity: Math.round(s * 100) / 100 });
        }
    }
    const clusters = CATEGORIES.map((key) => ({
        key,
        keywords: keywords.filter((k) => k.cluster === key).length,
        uncovered: keywords.filter((k) => k.cluster === key && k.status === 'nouveau' && (k.volume ?? 0) > 0).length,
        articles: articles.filter((a) => a.category === key && !a.draft).map((a) => a.slug),
    }));
    const briefsDir = join(RESEARCH, 'briefs');
    const briefs = existsSync(briefsDir) ? readdirSync(briefsDir).filter((f) => f.endsWith('.json')).map((f) => readJson(join(briefsDir, f), null)).filter(Boolean) : [];
    return {
        generatedAt: new Date().toISOString(),
        siteUrl: (process.env.PUBLIC_SITE_URL || '').replace(/\/$/, ''),
        settings: { autoPublish: settings.autoPublish, maxArticlesPerDay: settings.maxArticlesPerDay, dailyBudgetUsd: settings.dailyBudgetUsd, monthlyBudgetUsd: settings.monthlyBudgetUsd },
        usage: { dataforseo: readJson(join(RESEARCH, 'usage.json'), null), ai: readJson(join(RESEARCH, 'ai-usage.json'), { months: {} }).months },
        keywords, articles, cannibalisation, clusters, briefs,
        publications: readJson(join(RESEARCH, 'publications.json'), []),
    };
}

mkdirSync(OUT, { recursive: true });
for (const f of ['index.html', 'app.js', '_headers']) cpSync(join(HERE, 'public', f), join(OUT, f));
const data = buildData();
writeFileSync(join(OUT, 'data.json'), JSON.stringify(data));
console.log(`Tableau de bord : ${data.keywords.length} mots-clés, ${data.articles.length} articles → ${OUT}`);
