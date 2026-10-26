// Chooses the next article: a keyword with real demand (or an editorial-calendar topic when no data
// exists yet), business relevance, and no existing page targeting it. Writes a brief to research/briefs/.
//
//   node scripts/seo/plan.mjs            prints the chosen brief (nothing written)
//   node scripts/seo/plan.mjs --write    writes research/briefs/<date>-<slug>.json and marks the keyword
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LEGAL_PATTERNS, RESEARCH } from './config.mjs';
import { findCannibal, loadPosts } from './content.mjs';
import { classifyByRules, loadStore, normalize, saveStore } from './keyword-store.mjs';

/** Editorial calendar (§13): used when the keyword store has no usable candidate. */
export const CALENDAR = [
    { title: 'Comment préparer un récolement des archives', primaryKeyword: 'récolement des archives', category: 'inventaire-recolement', offer: 'inventaire' },
    { title: "Quelles étapes pour traiter un fonds d'archives", primaryKeyword: "traitement d'un fonds d'archives", category: 'inventaire-recolement', offer: 'inventaire' },
    { title: 'Comment organiser un plan de classement documentaire', primaryKeyword: 'plan de classement documentaire', category: 'classement-description', offer: 'inventaire' },
    { title: 'Archivage physique ou numérique : quelles différences', primaryKeyword: 'archivage physique et numérique', category: 'archivage-physique-numerique', offer: 'inventaire' },
    { title: "Estimer le coût et la durée d'un projet d'inventaire", primaryKeyword: "coût d'un inventaire d'archives", category: 'organisation-couts', offer: 'inventaire' },
    { title: 'Choisir un logiciel de gestion des archives', primaryKeyword: 'logiciel de gestion des archives', category: 'logiciels-outils', offer: 'inventaire' },
    { title: "Cahier des charges d'un projet d'archivage", primaryKeyword: "cahier des charges archivage", category: 'organisation-couts', offer: 'inventaire' },
    { title: 'Rédiger le cahier des charges d’une application sur mesure', primaryKeyword: 'cahier des charges application sur mesure', category: 'applications-sur-mesure', offer: 'sur-mesure' },
    { title: 'IA locale ou IA dans le cloud pour les données sensibles', primaryKeyword: 'intelligence artificielle locale', category: 'applications-sur-mesure', offer: 'sur-mesure' },
    { title: 'Tableau de gestion et durées de conservation au Maroc', primaryKeyword: 'tableau de gestion des archives', category: 'reglementation-maroc', offer: 'inventaire' },
];

export const slugify = (text) => normalize(text).replace(/'/g, ' ').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80).replace(/-$/, '');

const isLegal = (text) => LEGAL_PATTERNS.some((p) => p.test(normalize(text)));

/** Score = demand × relevance ÷ difficulty. Unknown volume counts as 0 demand (never invented). */
export function score(rec) {
    const volume = rec.metrics.searchVolume ?? 0;
    const difficulty = rec.metrics.difficulty ?? rec.metrics.competitionIndex ?? 50;
    const relevance = rec.classification?.cluster ? (rec.classification.offer === 'sur-mesure' ? 1 : 1.2) : 0;
    return (volume * relevance) / (1 + difficulty / 50);
}

export function chooseTopic(store, posts) {
    const candidates = Object.entries(store.keywords)
        .map(([key, rec]) => ({ key, rec: { ...rec, classification: rec.classification ?? classifyByRules(rec) } }))
        .filter(({ rec }) => rec.status === 'nouveau' && rec.classification.cluster && rec.language === 'fr' && (rec.metrics.searchVolume ?? 0) > 0)
        .filter(({ rec }) => Object.values(rec.provenance).every((p) => p.source !== 'dry-run'))
        .sort((a, b) => score(b.rec) - score(a.rec));
    for (const { key, rec } of candidates) {
        const cannibal = findCannibal({ title: rec.keyword, primaryKeyword: rec.keyword }, posts);
        if (cannibal) continue;
        return {
            source: 'keyword-research',
            keywordKey: key,
            primaryKeyword: rec.keyword,
            secondaryKeywords: rec.related.slice(0, 5),
            category: rec.classification.cluster,
            offer: rec.classification.offer,
            intent: rec.classification.intent,
            searchVolume: rec.metrics.searchVolume,
            competitors: (rec.serp?.results ?? []).slice(0, 5),
            requiresReview: rec.classification.legal || isLegal(rec.keyword),
        };
    }
    for (const topic of CALENDAR) {
        if (findCannibal(topic, posts)) continue;
        return { source: 'editorial-calendar', keywordKey: null, ...topic, secondaryKeywords: [], intent: 'informationnel', searchVolume: null, competitors: [], requiresReview: topic.category === 'reglementation-maroc' || isLegal(topic.primaryKeyword) };
    }
    return null;
}

export function makeBrief(topic, today = new Date().toISOString().slice(0, 10)) {
    const slug = slugify(topic.title ?? topic.primaryKeyword);
    return {
        date: today,
        slug,
        ...topic,
        workingTitle: topic.title ?? null,
        conversion: topic.offer === 'sur-mesure' ? 'projet sur mesure (/contact/?type=sur-mesure)' : 'démonstration du logiciel (/demander-une-demonstration/)',
        notes: topic.requiresReview
            ? 'Sujet réglementaire : relecture humaine obligatoire, sources officielles uniquement (docs/SOURCES-VERIFIEES.md).'
            : 'Publication automatique si la porte qualité passe.',
    };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const store = loadStore();
    const topic = chooseTopic(store, loadPosts());
    if (!topic) {
        console.log('Aucun sujet utile aujourd’hui : rien à publier.');
        process.exit(0);
    }
    const brief = makeBrief(topic);
    console.log(JSON.stringify(brief, null, 2));
    if (process.argv.includes('--write')) {
        const dir = join(RESEARCH, 'briefs');
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `${brief.date}-${brief.slug}.json`);
        if (existsSync(file)) JSON.parse(readFileSync(file, 'utf8'));
        writeFileSync(file, JSON.stringify(brief, null, 2) + '\n');
        if (brief.keywordKey) {
            store.keywords[brief.keywordKey].status = 'planifie';
            store.keywords[brief.keywordKey].brief = file.slice(RESEARCH.length + 1).replace(/\\/g, '/');
            saveStore(store);
        }
        console.log(`→ ${file}`);
    }
}
