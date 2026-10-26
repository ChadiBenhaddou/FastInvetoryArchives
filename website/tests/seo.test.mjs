import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { classifyByRules, keyOf, normalize, upsertMetrics } from '../scripts/seo/keyword-store.mjs';
import { BudgetExceeded, DataForSeo } from '../scripts/seo/dataforseo.mjs';
import { settings, BLOG } from '../scripts/seo/config.mjs';
import { findCannibal, loadPosts, sitePaths, splitFrontmatter } from '../scripts/seo/content.mjs';
import { chooseTopic, CALENDAR, slugify } from '../scripts/seo/plan.mjs';
import { runGate, unsourcedStatistics } from '../scripts/seo/quality-gate.mjs';
import { runDay } from '../scripts/seo/daily-article.mjs';
import { unpublish } from '../scripts/seo/unpublish.mjs';
import { parseCsv, importRows } from '../scripts/seo/import-csv.mjs';
import { runResearch } from '../scripts/seo/research.mjs';
import { fixtures } from '../scripts/seo/fixtures.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'seo-test-'));
const emptyStore = () => ({ version: 1, updatedAt: null, keywords: {} });

describe('keyword store', () => {
    it('normalises accents and Arabic spelling variants but keeps the original', () => {
        expect(normalize('  Récolement   des Archives ')).toBe('recolement des archives');
        expect(normalize('الإدارة')).toBe(normalize('الاداره'));
        const store = emptyStore();
        const rec = upsertMetrics(store, { keyword: 'Récolement des archives', country: 'MA', language: 'fr', metrics: { searchVolume: 90 }, source: 'dataforseo', endpoint: 'x' });
        expect(rec.keyword).toBe('Récolement des archives');
        expect(store.keywords[keyOf('recolement des archives', 'MA', 'fr')]).toBe(rec);
    });

    it('never overwrites a known value with a missing one, and records provenance', () => {
        const store = emptyStore();
        upsertMetrics(store, { keyword: 'ocr arabe', country: 'MA', language: 'fr', metrics: { searchVolume: 40, cpc: 0.3 }, source: 'dataforseo', endpoint: 'a' });
        const rec = upsertMetrics(store, { keyword: 'OCR arabe', country: 'MA', language: 'fr', metrics: { searchVolume: null, cpc: null, difficulty: 22 }, source: 'csv', endpoint: 'b' });
        expect(rec.metrics).toMatchObject({ searchVolume: 40, cpc: 0.3, difficulty: 22, competition: null });
        expect(rec.provenance.searchVolume.endpoint).toBe('a');
        expect(rec.provenance.difficulty.source).toBe('csv');
        expect(Object.keys(store.keywords)).toHaveLength(1);
    });

    it('classifies by rules: cluster, offer, legal topics', () => {
        const c = (k) => classifyByRules({ normalized: normalize(k) });
        expect(c('développement application sur mesure')).toMatchObject({ cluster: 'applications-sur-mesure', offer: 'sur-mesure' });
        expect(c('loi 69-99 archives')).toMatchObject({ legal: true });
        expect(c('inventaire des archives')).toMatchObject({ cluster: 'inventaire-recolement', offer: 'inventaire', legal: false });
    });

    it('imports an OpenSEO-style CSV', () => {
        const store = emptyStore();
        const rows = parseCsv('keyword,search_volume,keyword_difficulty,cpc\n"inventaire, archives",50,12,"0,4"\nocr arabe,,30,\n');
        expect(importRows(store, rows, { source: 'openseo' })).toBe(2);
        const recs = Object.values(store.keywords);
        expect(recs.find((r) => r.keyword === 'inventaire, archives').metrics).toMatchObject({ searchVolume: 50, difficulty: 12, cpc: 0.4 });
        expect(recs.find((r) => r.keyword === 'ocr arabe').metrics.searchVolume).toBeNull();
    });
});

describe('DataForSEO client', () => {
    let dir;
    const client = (opts) => new DataForSeo({ usageFile: join(dir, 'usage.json'), cacheDir: join(dir, 'cache'), logFile: join(dir, 'log'), ...opts });
    const ok = (cost = 0.05) => ({ status: 200, json: async () => ({ status_code: 20000, cost, tasks: [{ status_code: 20000, cost, result: [{ keyword: 'x' }] }] }) });
    beforeEach(() => {
        dir = tmp();
        process.env.DATAFORSEO_LOGIN = 'login';
        process.env.DATAFORSEO_PASSWORD = 'secret';
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('dry run: no network, no spending recorded', async () => {
        const fetchImpl = vi.fn();
        const c = client({ live: false, fetchImpl, fixtures });
        const result = await c.results('keywords_data/google_ads/keywords_for_keywords/live', { keywords: ['ocr arabe'] });
        expect(result.length).toBeGreaterThan(0);
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(existsSync(join(dir, 'usage.json'))).toBe(false);
    });

    it('live: Basic auth, cost recorded from the response, cached on the second call', async () => {
        const fetchImpl = vi.fn(async () => ok(0.05));
        const c = client({ live: true, fetchImpl });
        await c.post('serp/google/organic/live/regular', { keyword: 'a' });
        await c.post('serp/google/organic/live/regular', { keyword: 'a' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [, init] = fetchImpl.mock.calls[0];
        expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('login:secret').toString('base64')}`);
        const usage = JSON.parse(readFileSync(join(dir, 'usage.json'), 'utf8'));
        expect(usage.lastCost['serp/google/organic/live/regular']).toBe(0.05);
        expect(Object.values(usage.days)[0]).toBeCloseTo(0.05);
    });

    it('hard stop at the daily budget, before calling', async () => {
        writeFileSync(join(dir, 'usage.json'), JSON.stringify({ days: { [new Date().toISOString().slice(0, 10)]: settings.dailyBudgetUsd - 0.01 }, months: {}, lastCost: { 'serp/google/organic/live/regular': 0.05 }, requests: 3 }));
        const fetchImpl = vi.fn(async () => ok());
        await expect(client({ live: true, fetchImpl }).post('serp/google/organic/live/regular', { keyword: 'b' })).rejects.toBeInstanceOf(BudgetExceeded);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('retries a 500 with backoff, then succeeds; does not retry an API error', async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce({ status: 500, json: async () => ({}) }).mockResolvedValueOnce(ok());
        await client({ live: true, fetchImpl }).post('serp/google/organic/live/regular', { keyword: 'c' });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        const failing = vi.fn(async () => ({ status: 200, json: async () => ({ status_code: 40100, status_message: 'auth' }) }));
        await expect(client({ live: true, fetchImpl: failing }).post('serp/google/organic/live/regular', { keyword: 'd' })).rejects.toThrow(/40100/);
        expect(failing).toHaveBeenCalledTimes(1);
    }, 15_000);

    it('refuses live mode without credentials', () => {
        delete process.env.DATAFORSEO_PASSWORD;
        expect(() => client({ live: true })).toThrow(/DATAFORSEO/);
    });
});

describe('research and planning', () => {
    it('dry-run research tags every value as dry-run; planning never uses them', async () => {
        const { store } = await runResearch({ estimate: false, arabic: false, serp: 1, seeds: ['ocr arabe', 'inventaire des archives'] }, { client: new DataForSeo({ live: false, fixtures, logFile: join(tmp(), 'log') }), store: emptyStore(), log: () => {} });
        const recs = Object.values(store.keywords);
        expect(recs.length).toBeGreaterThan(2);
        expect(recs.every((r) => Object.values(r.provenance).every((p) => p.source === 'dry-run'))).toBe(true);
        expect(chooseTopic(store, []).source).toBe('editorial-calendar');
    });

    it('picks the highest-value real keyword not covered by an article', () => {
        const store = emptyStore();
        const add = (k, v) => upsertMetrics(store, { keyword: k, country: 'MA', language: 'fr', metrics: { searchVolume: v, competitionIndex: 20 }, source: 'dataforseo', endpoint: 'x' });
        add('inventaire des archives administratives', 500); // covered by an existing article
        add('plan de classement documentaire', 120);
        for (const r of Object.values(store.keywords)) r.classification = classifyByRules(r);
        const topic = chooseTopic(store, loadPosts());
        expect(topic.primaryKeyword).toBe('plan de classement documentaire');
        expect(topic.source).toBe('keyword-research');
    });

    it('detects cannibalisation and makes clean slugs', () => {
        const posts = loadPosts();
        expect(findCannibal({ title: 'OCR arabe', primaryKeyword: 'OCR arabe' }, posts)?.reason).toMatch(/même mot-clé/);
        expect(findCannibal(CALENDAR[2], posts)).toBeNull();
        expect(slugify("Traitement d'un fonds d'archives")).toBe('traitement-d-un-fonds-d-archives');
    });
});

// ------------------------------------------------------------------ quality gate

const GOOD_BODY = `Introduction utile sur la préparation du classement des dossiers avant un inventaire.

## Pourquoi un plan de classement

${'Le plan de classement organise les dossiers selon les activités de l’organisation et facilite la recherche. '.repeat(25)}

## Les étapes

${'Recenser les activités, regrouper les dossiers, définir une cotation stable, puis valider avec les services. '.repeat(25)}

## Les erreurs à éviter

${'Ne pas classer selon les personnes, ne pas multiplier les niveaux, documenter chaque choix pour les successeurs. '.repeat(25)}

Pour aller plus loin, voir [l’inventaire des archives administratives](/blog/comment-realiser-inventaire-archives-administratives/)
et le [logiciel d’inventaire](/logiciel-inventaire-archives/), ou [demander une démonstration](/demander-une-demonstration/).`;

const goodArticle = () => ({
    data: {
        title: 'Organiser un plan de classement documentaire efficace',
        description: 'Méthode pratique pour concevoir un plan de classement documentaire : activités, regroupements, cotation stable et erreurs à éviter.',
        slug: 'organiser-plan-classement-documentaire', pubDate: '2026-10-27', author: 'Équipe test',
        category: 'classement-description', tags: ['classement'], primaryKeyword: 'plan de classement documentaire',
        secondaryKeywords: ['cotation des dossiers'], offer: 'inventaire', draft: true, sources: [],
    },
    body: GOOD_BODY,
});

const ctx = (extra = {}) => ({ posts: loadPosts(), sitePaths: sitePaths(), ai: false, fetchImpl: vi.fn(async () => ({ status: 200 })), ...extra });
const failed = (result) => result.checks.filter((c) => !c.ok).map((c) => c.name);

describe('quality gate', () => {
    it('passes a sound article', async () => {
        const result = await runGate(goodArticle(), ctx());
        expect(failed(result)).toEqual([]);
        expect(result.pass).toBe(true);
    });

    it('blocks a duplicate topic (cannibalisation)', async () => {
        const a = goodArticle();
        a.data.primaryKeyword = 'OCR arabe';
        a.data.title = 'OCR arabe : ce qu’il faut savoir avant de commencer';
        expect(failed(await runGate(a, ctx()))).toContain('pas de cannibalisation');
    });

    it('blocks a dead source link and a domain off the allow-list', async () => {
        const a = goodArticle();
        a.data.sources = [{ title: 'Texte', url: 'https://www.archivesdumaroc.ma/page-disparue' }, { title: 'Blog', url: 'https://blog-quelconque.example/article' }];
        const result = await runGate(a, ctx({ fetchImpl: vi.fn(async () => ({ status: 404 })) }));
        expect(failed(result)).toEqual(expect.arrayContaining(['sources joignables', 'sources sur la liste blanche']));
    });

    it('blocks an invented statistic', async () => {
        const a = goodArticle();
        a.body += '\n\nSelon une étude récente, 73 % des administrations perdent des dossiers chaque année.';
        expect(unsourcedStatistics(a.body)).toHaveLength(1);
        expect(failed(await runGate(a, ctx()))).toContain('aucune statistique sans source');
    });

    it('blocks broken internal links, missing CTA and too-short text', async () => {
        const a = goodArticle();
        a.body = '## Un\n\nTexte court.\n\n## Deux\n\nVoir [ceci](/page-inexistante/).\n\n## Trois\n\nFin.';
        expect(failed(await runGate(a, ctx()))).toEqual(expect.arrayContaining(['liens internes valides', '≥ 2 liens internes', "appel à l'action adapté", 'longueur utile (≥ 650 mots)']));
    });

    it('blocks a legal claim without an official source', async () => {
        const a = goodArticle();
        a.body += '\n\nLa loi n° 69-99 impose un calendrier de conservation.';
        expect(failed(await runGate(a, ctx()))).toContain('faits réglementaires sourcés');
    });

    it('blocks when the independent AI review finds a problem', async () => {
        const review = vi.fn(async () => ({ data: { pass: false, summary: 'non', issues: [{ type: 'fonctionnalite-non-verifiee', excerpt: 'synchronisation cloud', reason: 'absente des fonctionnalités vérifiées' }] } }));
        const result = await runGate(goodArticle(), ctx({ ai: true, review }));
        expect(failed(result)).toEqual(['relecture IA indépendante']);
        expect(review.mock.calls[0][0].schema.required).toContain('pass');
    });

    it('accepts the 8 published articles (deterministic checks)', async () => {
        for (const post of loadPosts()) {
            const result = await runGate({ data: post.data, body: post.body }, ctx());
            expect(failed(result), post.data.slug).toEqual([]);
        }
    });
});

describe('daily pipeline', () => {
    const generate = (article) => vi.fn(async () => ({ ...article(), costUsd: 0.01, model: 'test' }));
    const passing = vi.fn(async () => ({ pass: true, checks: [{ name: 'ok', ok: true, detail: '' }] }));
    const failing = vi.fn(async () => ({ pass: false, checks: [{ name: 'liens internes valides', ok: false, detail: '/x/' }] }));

    it('publishes when the gate passes (draft: false)', async () => {
        const day = await runDay({ today: '2099-01-01', generate: generate(goodArticle), gate: passing, write: false });
        expect(day.mode).toBe('publish');
        expect(day.article.data.draft).toBe(false);
    });

    it('retries once with the gate feedback, then sends to review (draft: true)', async () => {
        const gen = generate(goodArticle);
        const day = await runDay({ today: '2099-01-02', generate: gen, gate: failing, write: false });
        expect(gen).toHaveBeenCalledTimes(2);
        expect(gen.mock.calls[1][1].feedback).toMatch(/liens internes valides/);
        expect(day.mode).toBe('review');
        expect(day.article.data.draft).toBe(true);
    });

    it('AUTO_PUBLISH=false sends every article to review', async () => {
        settings.autoPublish = false;
        try {
            expect((await runDay({ today: '2099-01-03', generate: generate(goodArticle), gate: passing, write: false })).mode).toBe('review');
        } finally {
            settings.autoPublish = true;
        }
    });

    it('legal topics always go to review', async () => {
        const legal = () => ({ ...goodArticle(), data: { ...goodArticle().data, category: 'reglementation-maroc' } });
        const day = await runDay({ today: '2099-01-04', generate: generate(legal), gate: passing, write: false });
        expect(day.mode).toBe('review');
        expect(day.reason).toMatch(/réglementaire/);
    });
});

describe('unpublish', () => {
    it('sets draft: true and updatedDate, keeps the body, logs it', () => {
        const dir = tmp();
        cpSync(join(BLOG, 'ocr-documents-arabes-possibilites-limites.md'), join(dir, 'a.md'));
        const before = splitFrontmatter(readFileSync(join(dir, 'a.md'), 'utf8'));
        const log = join(dir, 'publications.json');
        expect(unpublish('ocr-documents-arabes-possibilites-limites', 'test', { today: '2099-02-01', dir, logFile: log }).changed).toBe(true);
        const after = splitFrontmatter(readFileSync(join(dir, 'a.md'), 'utf8'));
        expect(after.data).toMatchObject({ draft: true, updatedDate: '2099-02-01', slug: before.data.slug });
        expect(after.body.trim()).toBe(before.body.trim());
        expect(JSON.parse(readFileSync(log, 'utf8'))[0].mode).toBe('unpublish');
        expect(unpublish('ocr-documents-arabes-possibilites-limites', 'test', { dir, logFile: log }).changed).toBe(false);
        rmSync(dir, { recursive: true, force: true });
    });
});
