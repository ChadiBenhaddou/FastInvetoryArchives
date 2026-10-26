// Articles and pages as seen by the automation: frontmatter, body, internal link targets, similarity.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse, stringify } from 'yaml';
import { BLOG, WEBSITE } from './config.mjs';
import { normalize } from './keyword-store.mjs';

export function splitFrontmatter(text) {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!m) throw new Error('frontmatter manquant');
    return { data: parse(m[1]) ?? {}, body: m[2] };
}

export function joinFrontmatter(data, body) {
    return `---\n${stringify(data, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`;
}

export function loadPosts(dir = BLOG) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((n) => n.endsWith('.md'))
        .map((name) => {
            const file = join(dir, name);
            const { data, body } = splitFrontmatter(readFileSync(file, 'utf8'));
            return { file, name, data, body };
        });
}

/** Static pages of the site (src/pages/*.astro) as URLs, plus published articles: valid internal link targets. */
export function sitePaths(posts = loadPosts()) {
    const pagesDir = join(WEBSITE, 'src/pages');
    const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    const paths = walk(pagesDir)
        .filter((f) => f.endsWith('.astro') && !f.includes('['))
        .map((f) => '/' + relative(pagesDir, f).split(sep).join('/').replace(/\.astro$/, '').replace(/(^|\/)index$/, '') + '/')
        .map((p) => p.replace(/\/+/g, '/'))
        .filter((p) => !['/404/', '/merci/'].includes(p));
    for (const p of posts) if (!p.data.draft) paths.push(`/blog/${p.data.slug}/`);
    return [...new Set(paths)].sort();
}

const STOP = new Set(('le la les un une des de du d l et ou a au aux en pour par sur avec sans dans ce cette ces son sa ses vos votre nos notre ' +
    'qui que quoi quel quelle quels quelles comment pourquoi est sont faut il elle on vous nous ne pas plus moins tout tous').split(' '));

export function tokens(text) {
    return new Set(normalize(text).replace(/[^a-z0-9؀-ۿ\s-]/g, ' ').split(/[\s-]+/).filter((w) => w.length > 2 && !STOP.has(w)));
}

export function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    return inter / (a.size + b.size - inter);
}

/** Topic signature of an article or a candidate: title + keywords. */
export const topicTokens = ({ title = '', primaryKeyword = '', secondaryKeywords = [] }) => tokens([title, primaryKeyword, ...secondaryKeywords].join(' '));

/**
 * Cannibalisation: the candidate targets what an existing page already targets.
 * Same normalised primary keyword, or a primary keyword already used as secondary, or a close topic signature.
 */
export function findCannibal(candidate, posts, threshold = 0.5) {
    const primary = normalize(candidate.primaryKeyword ?? '');
    for (const post of posts) {
        const d = post.data;
        if (normalize(d.primaryKeyword ?? '') === primary) return { post, reason: 'même mot-clé principal' };
        if ((d.secondaryKeywords ?? []).some((k) => normalize(k) === primary)) return { post, reason: 'mot-clé principal déjà ciblé en secondaire' };
        const score = jaccard(topicTokens(candidate), topicTokens(d));
        if (score >= threshold) return { post, reason: `sujet trop proche (similarité ${score.toFixed(2)})` };
    }
    return null;
}

/** Word 5-gram shingles: near-duplicate content detection between bodies. */
export function shingles(text, n = 5) {
    const words = normalize(text.replace(/[#*>`[\]()|_-]/g, ' ')).split(/\s+/).filter(Boolean);
    const set = new Set();
    for (let i = 0; i + n <= words.length; i++) set.add(words.slice(i, i + n).join(' '));
    return set;
}
