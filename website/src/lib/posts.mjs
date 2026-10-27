import { getCollection } from 'astro:content';

export const CATEGORIES = {
    'inventaire-recolement': 'Inventaire et récolement',
    'classement-description': 'Classement et description',
    'archives-administratives': 'Archives administratives',
    'archivage-physique-numerique': 'Archivage physique et numérique',
    'numerisation-ocr-recherche': 'Numérisation, OCR et recherche',
    'conservation-elimination': 'Conservation et élimination',
    'reglementation-maroc': 'Réglementation au Maroc',
    'organisation-couts': 'Organisation et coûts',
    'logiciels-outils': 'Logiciels et outils',
    'transformation-numerique': 'Transformation numérique',
    'applications-sur-mesure': 'Applications sur mesure',
};

/** Published articles only (drafts are never built), newest first. */
export async function publishedPosts() {
    const posts = await getCollection('blog', ({ data }) => !data.draft);
    return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export const postPath = (post) => `/blog/${post.data.slug}/`;

export const formatDate = (date) => new Intl.DateTimeFormat('fr-MA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);

/** Related articles: same category first, then shared tags, then same offer. */
export function relatedPosts(post, all, count = 3) {
    const score = (other) =>
        (other.data.category === post.data.category ? 3 : 0) +
        other.data.tags.filter((t) => post.data.tags.includes(t)).length +
        (other.data.offer === post.data.offer ? 1 : 0);
    return all
        .filter((other) => other.id !== post.id)
        .map((other) => ({ other, s: score(other) }))
        .filter(({ s }) => s > 0)
        .sort((a, b) => b.s - a.s || b.other.data.pubDate - a.other.data.pubDate)
        .slice(0, count)
        .map(({ other }) => other);
}

export function readingMinutes(body) {
    return Math.max(1, Math.round(body.split(/\s+/).length / 220));
}
