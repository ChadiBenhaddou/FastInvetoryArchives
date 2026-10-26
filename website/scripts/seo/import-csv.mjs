// Imports keywords exported as CSV (OpenSEO or any tool) into research/keywords.json.
// Recognised columns: keyword, volume|search_volume, difficulty|keyword_difficulty, cpc, intent.
//   node scripts/seo/import-csv.mjs export.csv [--language fr] [--source openseo]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { classifyAll, loadStore, saveStore, upsertMetrics } from './keyword-store.mjs';

export function parseCsv(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') quoted = false;
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ',' || c === ';') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.some((f) => f !== '')) rows.push(row);
            row = [];
        } else field += c;
    }
    row.push(field);
    if (row.some((f) => f !== '')) rows.push(row);
    const [header, ...data] = rows;
    const keys = header.map((h) => h.trim().toLowerCase());
    return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i]?.trim() ?? ''])));
}

const num = (v) => (v === undefined || v === '' || Number.isNaN(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));

export function importRows(store, rows, { language = 'fr', source = 'csv' } = {}) {
    let n = 0;
    for (const r of rows) {
        const keyword = r.keyword ?? r['mot-clé'] ?? r.query;
        if (!keyword) continue;
        upsertMetrics(store, {
            keyword, country: 'MA', language, source, endpoint: 'import-csv',
            metrics: { searchVolume: num(r.volume ?? r.search_volume), difficulty: num(r.difficulty ?? r.keyword_difficulty), cpc: num(r.cpc) },
        });
        n++;
    }
    classifyAll(store);
    return n;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    const file = args.find((a) => !a.startsWith('--'));
    const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
    if (!file) {
        console.error('usage : node scripts/seo/import-csv.mjs export.csv [--language fr] [--source openseo]');
        process.exit(2);
    }
    const store = loadStore();
    const n = importRows(store, parseCsv(readFileSync(file, 'utf8')), { language: opt('--language', 'fr'), source: opt('--source', 'csv') });
    saveStore(store);
    console.log(`${n} mot(s)-clé(s) importé(s).`);
}
