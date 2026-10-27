// DataForSEO client: Basic auth from server-side secrets, budget with hard stop, response cache,
// bounded retries with backoff, Google Ads rate limit, request log, dry-run mode (default).
// Costs are never hardcoded: each response's `cost` is recorded, and the last observed cost of an
// endpoint is the estimate for its next call (first call: capped by SEO_UNKNOWN_CALL_MAX_USD).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESEARCH, settings } from './config.mjs';

const API = 'https://api.dataforseo.com/v3/';
const CACHE_DIR = join(RESEARCH, 'cache');
const USAGE_FILE = join(RESEARCH, 'usage.json');
const LOG_FILE = join(RESEARCH, 'requests.log');

export class BudgetExceeded extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (d = new Date()) => d.toISOString().slice(0, 10);
const month = (d = new Date()) => d.toISOString().slice(0, 7);

export function loadUsage(file = USAGE_FILE) {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { days: {}, months: {}, lastCost: {}, requests: 0 };
}

export class DataForSeo {
    /**
     * @param {object} opts
     * @param {boolean} [opts.live]   real HTTP calls (otherwise dry run: fixtures, no cost)
     * @param {Function} [opts.fetchImpl]
     * @param {Function} [opts.fixtures]  (endpoint, body) → fake response, for dry runs and tests
     */
    constructor({ live = settings.live, fetchImpl = fetch, fixtures = null, usageFile = USAGE_FILE, cacheDir = CACHE_DIR, logFile = LOG_FILE, now = () => new Date() } = {}) {
        this.live = live;
        this.fetch = fetchImpl;
        this.fixtures = fixtures;
        this.usageFile = usageFile;
        this.cacheDir = cacheDir;
        this.logFile = logFile;
        this.now = now;
        this.usage = loadUsage(usageFile);
        this.requestsThisRun = 0;
        this.lastGoogleAdsCall = 0;
        if (live && (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD)) {
            throw new Error('DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD manquants (secrets GitHub Actions).');
        }
    }

    spentToday() { return this.usage.days[day(this.now())] ?? 0; }
    spentThisMonth() { return this.usage.months[month(this.now())] ?? 0; }

    /** Estimated cost of one call to this endpoint: last observed, or the ceiling for unknown endpoints. */
    estimate(endpoint) { return this.usage.lastCost[endpoint] ?? settings.unknownCallMaxUsd; }

    assertBudget(endpoint) {
        const cost = this.estimate(endpoint);
        if (this.requestsThisRun >= settings.maxRequestsPerRun) throw new BudgetExceeded(`max ${settings.maxRequestsPerRun} requêtes par exécution atteint`);
        if (this.spentToday() + cost > settings.dailyBudgetUsd) throw new BudgetExceeded(`budget du jour (${settings.dailyBudgetUsd} $) : ${this.spentToday().toFixed(4)} $ dépensés, prochaine requête ~${cost} $`);
        if (this.spentThisMonth() + cost > settings.monthlyBudgetUsd) throw new BudgetExceeded(`budget du mois (${settings.monthlyBudgetUsd} $) atteint`);
    }

    cachePath(endpoint, body) {
        const hash = createHash('sha256').update(endpoint + JSON.stringify(body)).digest('hex').slice(0, 24);
        return join(this.cacheDir, `${endpoint.replace(/\//g, '_')}-${hash}.json`);
    }

    record(endpoint, cost, cached) {
        const d = day(this.now()), m = month(this.now());
        if (!cached && this.live) {
            mkdirSync(join(this.usageFile, '..'), { recursive: true });
            this.usage.days[d] = (this.usage.days[d] ?? 0) + cost;
            this.usage.months[m] = (this.usage.months[m] ?? 0) + cost;
            this.usage.lastCost[endpoint] = cost;
            this.usage.requests += 1;
            writeFileSync(this.usageFile, JSON.stringify(this.usage, null, 2) + '\n');
        }
        mkdirSync(join(this.logFile, '..'), { recursive: true });
        appendFileSync(this.logFile, `${this.now().toISOString()}\t${this.live ? 'live' : 'dry'}\t${cached ? 'cache' : 'api'}\t${endpoint}\t${cost}\n`);
    }

    /** POST one task to a Live endpoint. Returns the parsed response (tasks[0].result…). */
    async post(endpoint, task) {
        const body = [task];
        const cacheFile = this.cachePath(endpoint, body);
        if (existsSync(cacheFile)) {
            const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
            if (Date.now() - Date.parse(cached.savedAt) < settings.cacheDays * 86_400_000) {
                this.record(endpoint, 0, true);
                return cached.response;
            }
        }
        if (!this.live) {
            const response = this.fixtures ? this.fixtures(endpoint, task) : { status_code: 20000, cost: 0, tasks: [{ status_code: 20000, cost: 0, result: [] }] };
            this.record(endpoint, 0, false);
            return response;
        }
        this.assertBudget(endpoint);
        if (endpoint.startsWith('keywords_data/google_ads/')) {
            // Google Ads Live endpoints: at most 12 requests per minute per account.
            const wait = this.lastGoogleAdsCall + 5_100 - Date.now();
            if (wait > 0) await sleep(wait);
            this.lastGoogleAdsCall = Date.now();
        }
        this.requestsThisRun += 1;
        const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
        let lastError;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await this.fetch(API + endpoint, {
                    method: 'POST',
                    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (data.status_code !== 20000) throw Object.assign(new Error(`DataForSEO ${data.status_code} ${data.status_message}`), { fatal: true });
                const taskStatus = data.tasks?.[0]?.status_code;
                if (taskStatus && taskStatus !== 20000) throw Object.assign(new Error(`tâche ${taskStatus} ${data.tasks[0].status_message}`), { fatal: true });
                this.record(endpoint, Number(data.cost ?? 0), false);
                mkdirSync(this.cacheDir, { recursive: true });
                writeFileSync(cacheFile, JSON.stringify({ savedAt: new Date().toISOString(), response: data }));
                return data;
            } catch (error) {
                lastError = error;
                if (error.fatal) break;
                await sleep(1000 * 2 ** attempt + Math.random() * 500);
            }
        }
        throw lastError;
    }

    /** Results array of the single task (empty when the API has no data). */
    async results(endpoint, task) {
        const data = await this.post(endpoint, task);
        return data.tasks?.[0]?.result ?? [];
    }
}
