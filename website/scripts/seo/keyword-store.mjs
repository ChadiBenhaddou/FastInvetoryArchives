// Keyword research store: research/keywords.json (versioned). One record per (normalised keyword,
// country, language). API values keep their provenance; rule/AI classifications are kept apart;
// a missing value stays null, never 0.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLUSTERS, LEGAL_PATTERNS, RESEARCH, settings } from './config.mjs';

export const STORE_FILE = join(RESEARCH, 'keywords.json');
export const STATUSES = ['nouveau', 'planifie', 'redige', 'approuve', 'publie', 'mis-a-jour', 'ecarte'];

/** Lowercase, no accents (French), Arabic spelling variants unified (same rules as the product's search). */
export function normalize(keyword) {
    return keyword
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '') // Latin accents
        .replace(/[ً-ٰٟـ]/g, '') // Arabic vowels, superscript alif, tatweel
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .toLowerCase()
        .replace(/[’']/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

export const keyOf = (keyword, country, language) => `${country}|${language}|${normalize(keyword)}`;

export function loadStore(file = STORE_FILE) {
    if (!existsSync(file)) return { version: 1, updatedAt: null, keywords: {} };
    return JSON.parse(readFileSync(file, 'utf8'));
}

export function saveStore(store, file = STORE_FILE) {
    mkdirSync(RESEARCH, { recursive: true });
    store.updatedAt = new Date().toISOString();
    // Sorted keys: readable, stable diffs in git.
    const sorted = Object.fromEntries(Object.entries(store.keywords).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(file, JSON.stringify({ ...store, keywords: sorted }, null, 2) + '\n', 'utf8');
}

const empty = (keyword, country, language) => ({
    keyword, // as first seen (accents and case kept)
    normalized: normalize(keyword),
    country,
    language,
    metrics: { searchVolume: null, competition: null, competitionIndex: null, cpc: null, difficulty: null, monthlySearches: null },
    provenance: {}, // metric name → { source, endpoint, retrievedAt }
    serp: null, // { retrievedAt, results: [{ rank, url, domain, title }] }
    related: [],
    classification: null, // { intent, cluster, offer, legal, by: 'rules' | 'ai', at }
    brief: null,
    articleUrl: null,
    status: 'nouveau',
    firstSeen: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
});

/** Adds or updates a keyword with API metrics. `metrics` may contain nulls: they never overwrite a known value. */
export function upsertMetrics(store, { keyword, country, language, metrics = {}, source, endpoint, related = [] }) {
    const key = keyOf(keyword, country, language);
    const rec = store.keywords[key] ?? empty(keyword, country, language);
    const at = new Date().toISOString();
    for (const [name, value] of Object.entries(metrics)) {
        if (value === null || value === undefined) continue;
        rec.metrics[name] = value;
        rec.provenance[name] = { source, endpoint, retrievedAt: at };
    }
    for (const r of related) if (!rec.related.includes(r)) rec.related.push(r);
    rec.lastUpdated = at;
    store.keywords[key] = rec;
    return rec;
}

export function setSerp(store, key, results, endpoint) {
    const rec = store.keywords[key];
    if (!rec) return;
    rec.serp = { retrievedAt: new Date().toISOString(), endpoint, results };
    rec.lastUpdated = rec.serp.retrievedAt;
}

/** Rule-based classification (no API, no AI): cluster, target offer, intent, legal topic. */
export function classifyByRules(rec) {
    const n = rec.normalized;
    const cluster = CLUSTERS.find((c) => c.patterns.some((p) => p.test(n))) ?? null;
    const intent = /\b(prix|tarif|devis|cout|acheter|prestataire|societe|entreprise)\b/.test(n)
        ? 'commercial'
        : /\b(logiciel|application|solution|outil)\b/.test(n)
          ? 'commercial-investigation'
          : 'informationnel';
    return {
        intent,
        cluster: cluster?.key ?? null,
        offer: cluster?.offer ?? null,
        legal: LEGAL_PATTERNS.some((p) => p.test(n)),
        by: 'rules',
        at: new Date().toISOString(),
    };
}

export function classifyAll(store) {
    for (const rec of Object.values(store.keywords)) {
        if (!rec.classification || rec.classification.by === 'rules') rec.classification = classifyByRules(rec);
    }
}

export function isStale(rec, now = Date.now()) {
    const dates = Object.values(rec.provenance).map((p) => Date.parse(p.retrievedAt));
    if (!dates.length) return true;
    return now - Math.min(...dates) > settings.staleDays * 86_400_000;
}
