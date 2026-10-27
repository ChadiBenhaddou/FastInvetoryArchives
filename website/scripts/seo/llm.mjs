// Claude calls of the automation (writer and independent reviewer), through the official SDK.
// - Structured outputs: the answer must match a JSON schema (output_config.format).
// - The large, stable reference context (features, sources, style guide) is a cached system block.
// - Server-side refusal fallback ("default"): a policy decline is retried on Anthropic's recommended
//   model inside the same call; a final refusal is reported, never read as content.
// - Cost of every call computed from response.usage, logged, and checked against a monthly AI budget.
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESEARCH } from './config.mjs';

const USAGE_FILE = join(RESEARCH, 'ai-usage.json');

// $ per million tokens (Anthropic first-party rates, October 2026). Override with SEO_AI_PRICES_JSON
// ({"model": {"input":…, "output":…, "cacheRead":…}}) when prices change; cache writes cost 1.25× input.
const PRICES = {
    'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
    'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
    ...JSON.parse(process.env.SEO_AI_PRICES_JSON || '{}'),
};

export class AiBudgetExceeded extends Error {}
export class AiRefused extends Error {}

export function costOf(model, usage) {
    const p = PRICES[model];
    if (!p) return null; // unknown model: cost unknown, reported as such
    const m = 1_000_000;
    return ((usage.input_tokens ?? 0) * p.input + (usage.cache_creation_input_tokens ?? 0) * p.input * 1.25 +
        (usage.cache_read_input_tokens ?? 0) * p.cacheRead + (usage.output_tokens ?? 0) * p.output) / m;
}

function loadUsage() {
    return existsSync(USAGE_FILE) ? JSON.parse(readFileSync(USAGE_FILE, 'utf8')) : { months: {}, calls: [] };
}

export function aiSpentThisMonth(usage = loadUsage()) {
    return usage.months[new Date().toISOString().slice(0, 7)] ?? 0;
}

function recordUsage(entry) {
    const usage = loadUsage();
    const month = new Date().toISOString().slice(0, 7);
    usage.months[month] = (usage.months[month] ?? 0) + (entry.costUsd ?? 0);
    usage.calls = [...usage.calls, entry].slice(-200);
    mkdirSync(RESEARCH, { recursive: true });
    writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2) + '\n');
}

/**
 * One structured call. Returns { data, model, usage, costUsd }.
 * @param {object} o
 * @param {string} o.model
 * @param {string} o.purpose        'writer' | 'reviewer' (logged)
 * @param {string} o.reference      stable reference context (cached)
 * @param {string} o.instructions   role instructions (stable, cached with the reference)
 * @param {string} o.input          the variable part (brief, article…)
 * @param {object} o.schema         JSON schema of the answer
 * @param {'low'|'medium'|'high'|'xhigh'|'max'} [o.effort]
 * @param {number} [o.maxTokens]
 */
export async function callJson({ model, purpose, reference, instructions, input, schema, effort = 'high', maxTokens = 32000, client = new Anthropic({ maxRetries: 4 }) }) {
    const budget = Number(process.env.SEO_AI_MONTHLY_BUDGET_USD ?? 20);
    if (aiSpentThisMonth() >= budget) throw new AiBudgetExceeded(`budget IA du mois atteint (${budget} $)`);

    // Streaming: long outputs never hit the HTTP timeout; finalMessage() gathers the whole message.
    const stream = client.beta.messages.stream({
        model,
        max_tokens: maxTokens,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort, format: { type: 'json_schema', schema } },
        system: [
            { type: 'text', text: instructions },
            { type: 'text', text: reference, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: input }],
    });
    const message = await stream.finalMessage();
    const costUsd = costOf(message.model, message.usage);
    recordUsage({ at: new Date().toISOString(), purpose, model: message.model, usage: message.usage, costUsd, stop: message.stop_reason });

    if (message.stop_reason === 'refusal') {
        throw new AiRefused(`refus du modèle (${message.stop_details?.category ?? 'sans catégorie'})`);
    }
    if (message.stop_reason === 'max_tokens') throw new Error(`réponse tronquée (max_tokens ${maxTokens})`);
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { data: JSON.parse(text), model: message.model, usage: message.usage, costUsd };
}
