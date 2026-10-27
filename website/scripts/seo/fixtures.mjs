// Fake DataForSEO responses for dry runs and tests (same shape as the documented Live responses).
// Values are clearly fake (volumes multiples of 10 from a hash) and tagged source "dry-run" in the store.
import { createHash } from 'node:crypto';

const fakeVolume = (keyword) => (parseInt(createHash('md5').update(keyword).digest('hex').slice(0, 4), 16) % 50) * 10;

export function fixtures(endpoint, task) {
    if (endpoint.includes('keywords_for_keywords')) {
        const result = task.keywords.flatMap((seed) => [seed, `${seed} maroc`, `logiciel ${seed}`].map((keyword) => ({
            keyword,
            search_volume: fakeVolume(keyword) || null,
            competition: 'LOW',
            competition_index: 10,
            cpc: 0.5,
            monthly_searches: null,
        })));
        return { status_code: 20000, cost: 0, tasks: [{ status_code: 20000, cost: 0, result }] };
    }
    if (endpoint.includes('serp/google/organic')) {
        const items = [1, 2, 3].map((rank) => ({ type: 'organic', rank_group: rank, url: `https://exemple-${rank}.ma/${encodeURIComponent(task.keyword)}`, domain: `exemple-${rank}.ma`, title: `${task.keyword} — résultat ${rank}` }));
        return { status_code: 20000, cost: 0, tasks: [{ status_code: 20000, cost: 0, result: [{ items }] }] };
    }
    return { status_code: 20000, cost: 0, tasks: [{ status_code: 20000, cost: 0, result: [] }] };
}
