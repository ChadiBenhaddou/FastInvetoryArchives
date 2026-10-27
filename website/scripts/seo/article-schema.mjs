// Same rules as src/content.config.ts, in plain JavaScript, so the quality gate can check an article
// before it is written and built. Keep both in step.
export const CATEGORIES = [
    'inventaire-recolement', 'classement-description', 'archives-administratives', 'archivage-physique-numerique',
    'numerisation-ocr-recherche', 'conservation-elimination', 'reglementation-maroc', 'organisation-couts',
    'logiciels-outils', 'transformation-numerique', 'applications-sur-mesure',
];
export const OFFERS = ['inventaire', 'sur-mesure'];

/** @returns {string[]} problems (empty = valid) */
export function validateFrontmatter(d) {
    const p = [];
    const str = (k, min, max) => {
        if (typeof d[k] !== 'string') return p.push(`${k} manquant`);
        if (d[k].length < min || d[k].length > max) p.push(`${k} : ${d[k].length} caractères (attendu ${min}-${max})`);
    };
    str('title', 20, 70);
    str('description', 70, 160);
    str('author', 2, 120);
    str('primaryKeyword', 3, 120);
    if (typeof d.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)) p.push('slug invalide');
    if (Number.isNaN(Date.parse(d.pubDate))) p.push('pubDate invalide');
    if (d.updatedDate !== undefined && Number.isNaN(Date.parse(d.updatedDate))) p.push('updatedDate invalide');
    if (!CATEGORIES.includes(d.category)) p.push(`catégorie inconnue : ${d.category}`);
    if (!OFFERS.includes(d.offer)) p.push(`offre inconnue : ${d.offer}`);
    if (!Array.isArray(d.tags ?? []) || (d.tags ?? []).length > 8) p.push('tags : 8 au plus');
    if (!Array.isArray(d.secondaryKeywords ?? []) || (d.secondaryKeywords ?? []).length > 10) p.push('secondaryKeywords : 10 au plus');
    if (typeof (d.draft ?? false) !== 'boolean') p.push('draft doit être true/false');
    for (const s of d.sources ?? []) {
        try {
            new URL(s.url);
        } catch {
            p.push(`source sans URL valide : ${s.title}`);
        }
        if (!s.title) p.push('source sans titre');
    }
    return p;
}
