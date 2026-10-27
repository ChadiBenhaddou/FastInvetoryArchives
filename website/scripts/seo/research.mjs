// Keyword research for Morocco: seeds → Google Ads keyword ideas (with volume, CPC, competition)
// → SERP top 10 of the most promising new keywords → rule classification → research/keywords.json.
//
//   node scripts/seo/research.mjs --estimate        plan + cost estimate, no call
//   node scripts/seo/research.mjs                   dry run (default locally): fixtures, writes keywords.dry.json
//   SEO_LIVE=true node scripts/seo/research.mjs     real calls, within the budget (CI)
//   options: --arabic (also Arabic for Morocco), --serp N (SERP for N keywords, default 3), --seeds a,b,c
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BudgetExceeded, DataForSeo } from './dataforseo.mjs';
import { MARKETS, RESEARCH, SEEDS, settings } from './config.mjs';
import { classifyAll, loadStore, saveStore, setSerp, upsertMetrics } from './keyword-store.mjs';
import { fixtures } from './fixtures.mjs';

const IDEAS = 'keywords_data/google_ads/keywords_for_keywords/live';
const SERP = 'serp/google/organic/live/regular';

export function parseArgs(argv) {
    const args = { estimate: false, arabic: false, serp: 3, seeds: null };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--estimate') args.estimate = true;
        else if (argv[i] === '--arabic') args.arabic = true;
        else if (argv[i] === '--serp') args.serp = Number(argv[++i]);
        else if (argv[i] === '--seeds') args.seeds = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    }
    return args;
}

const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

export function plan(args) {
    const markets = MARKETS.filter((m) => m.language === 'fr' || args.arabic);
    const calls = [];
    for (const market of markets) {
        const seeds = args.seeds ?? SEEDS[market.language];
        for (const batch of chunks(seeds, 20)) calls.push({ endpoint: IDEAS, market, task: { keywords: batch, location_name: market.location_name, language_code: market.language_code, sort_by: 'search_volume' } });
    }
    return { calls, serpCount: args.serp };
}

/** Picks keywords worth a SERP check: relevant cluster, no SERP yet, highest volume first. */
export function serpCandidates(store, count) {
    return Object.entries(store.keywords)
        .filter(([, r]) => r.classification?.cluster && !r.serp && r.status === 'nouveau')
        .sort(([, a], [, b]) => (b.metrics.searchVolume ?? -1) - (a.metrics.searchVolume ?? -1))
        .slice(0, count);
}

export async function runResearch(args, { client = new DataForSeo({ fixtures }), store = loadStore(), log = console.log } = {}) {
    const { calls, serpCount } = plan(args);
    if (args.estimate) {
        const ideasCost = calls.length * client.estimate(IDEAS);
        const serpCost = serpCount * client.estimate(SERP);
        log(`Plan : ${calls.length} requête(s) d'idées + ${serpCount} SERP.`);
        log(`Estimation : ${(ideasCost + serpCost).toFixed(3)} $ (coûts observés ou plafond ${settings.unknownCallMaxUsd} $ par point d'appel inconnu).`);
        log(`Dépensé : ${client.spentToday().toFixed(3)} $ aujourd'hui / ${settings.dailyBudgetUsd} $, ${client.spentThisMonth().toFixed(3)} $ ce mois / ${settings.monthlyBudgetUsd} $.`);
        return { store, stopped: null, estimated: ideasCost + serpCost };
    }
    let stopped = null;
    try {
        for (const call of calls) {
            for (const item of await client.results(call.endpoint, call.task)) {
                if (!item?.keyword) continue;
                upsertMetrics(store, {
                    keyword: item.keyword,
                    country: call.market.country,
                    language: call.market.language,
                    source: client.live ? 'dataforseo' : 'dry-run',
                    endpoint: call.endpoint,
                    metrics: {
                        searchVolume: item.search_volume ?? null,
                        competition: item.competition ?? null,
                        competitionIndex: item.competition_index ?? null,
                        cpc: item.cpc ?? null,
                        monthlySearches: item.monthly_searches ?? null,
                    },
                    related: call.task.keywords.filter((s) => s !== item.keyword).slice(0, 5),
                });
            }
        }
        classifyAll(store);
        for (const [key, rec] of serpCandidates(store, serpCount)) {
            const market = MARKETS.find((m) => m.country === rec.country && m.language === rec.language);
            const [result] = await client.results(SERP, { keyword: rec.keyword, location_name: market.location_name, language_code: market.language_code, depth: 10 });
            const organic = (result?.items ?? []).filter((i) => i.type === 'organic').map((i) => ({ rank: i.rank_group, url: i.url, domain: i.domain, title: i.title }));
            setSerp(store, key, organic, SERP);
        }
    } catch (error) {
        if (!(error instanceof BudgetExceeded)) throw error;
        stopped = error.message; // hard stop: keep what was already collected
        log(`Arrêt budgétaire : ${stopped}`);
    }
    classifyAll(store);
    return { store, stopped };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = parseArgs(process.argv.slice(2));
    const client = new DataForSeo({ fixtures });
    const { store, stopped } = await runResearch(args, { client });
    if (!args.estimate) {
        // A dry run never writes fake metrics into the real store.
        const file = client.live ? undefined : join(RESEARCH, 'keywords.dry.json');
        saveStore(store, file);
        console.log(`${Object.keys(store.keywords).length} mots-clés → ${file ?? 'research/keywords.json'}${stopped ? ' (arrêt budgétaire)' : ''}`);
    }
}

