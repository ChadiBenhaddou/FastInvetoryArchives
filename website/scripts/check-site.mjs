// Checks the built site (dist/) — run after `npm run build`. Exit code 1 on any problem.
//   internal links resolve · unique titles/descriptions · canonical = page · sitemap = indexable pages
//   drafts not built · 404 page · no orphan page · production: no "[À COMPLÉTER" / "[À VALIDER" left
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { siteEnv } from '../src/config/site.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const production = siteEnv() === 'production';
const problems = [];
const fail = (msg) => problems.push(msg);

if (!existsSync(DIST)) {
    console.error('dist/ introuvable : lancer npm run build');
    process.exit(1);
}

function walk(dir) {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const urlOf = (file) => '/' + relative(DIST, file).split(sep).join('/').replace(/index\.html$/, '').replace(/\.html$/, '/');
const decode = (s) => s?.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (html, re) => decode((html.match(re) ?? [])[1]);

const pages = htmlFiles.map((file) => {
    const html = readFileSync(file, 'utf8');
    return {
        file,
        url: urlOf(file),
        html,
        title: attr(html, /<title>([^<]*)<\/title>/),
        description: attr(html, /<meta name="description" content="([^"]*)"/),
        canonical: attr(html, /<link rel="canonical" href="([^"]*)"/),
        robots: attr(html, /<meta name="robots" content="([^"]*)"/) ?? '',
        // noindex chosen by the page itself (404); outside production every page is noindex.
        ownNoindex: /<html[^>]*data-noindex="page"/.test(html),
        links: [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]),
    };
});
const isIndexable = (p) => !p.ownNoindex && !p.url.startsWith('/404');
const indexable = pages.filter(isIndexable);

// 1. Internal links resolve to a built file.
const exists = (path) => {
    const clean = decodeURIComponent(path.split('#')[0].split('?')[0]);
    if (!clean || clean === '/') return existsSync(join(DIST, 'index.html'));
    const target = join(DIST, clean);
    return existsSync(join(target, 'index.html')) || (existsSync(target) && statSync(target).isFile());
};
const REDIRECTS = readFileSync(join(DIST, '_redirects'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/)[0]);
for (const page of pages) {
    for (const href of page.links) {
        if (!href.startsWith('/') || href.startsWith('//')) continue;
        if (href.startsWith('/api/')) continue;
        if (!exists(href) && !REDIRECTS.includes(href.split('?')[0])) fail(`lien cassé sur ${page.url} → ${href}`);
        if (!href.split('?')[0].split('#')[0].endsWith('/') && !/\.[a-z0-9]+$/i.test(href.split('?')[0])) fail(`lien sans / final sur ${page.url} → ${href}`);
    }
}

// 2. Unique titles and descriptions; present and within limits.
const seen = { title: new Map(), description: new Map() };
for (const page of indexable) {
    for (const key of ['title', 'description']) {
        const value = page[key];
        if (!value) fail(`${key} manquant : ${page.url}`);
        else if (seen[key].has(value)) fail(`${key} en double : ${page.url} et ${seen[key].get(value)}`);
        else seen[key].set(value, page.url);
    }
    if (page.description && (page.description.length < 70 || page.description.length > 165)) fail(`description de ${page.description.length} caractères : ${page.url}`);
    if (!page.html.match(/<h1[\s>]/)) fail(`pas de h1 : ${page.url}`);
    if ((page.html.match(/<h1[\s>]/g) ?? []).length > 1) fail(`plusieurs h1 : ${page.url}`);
}

// 3. Canonical points to the page itself (absolute URL, trailing slash).
for (const page of indexable) {
    if (!page.canonical) fail(`canonical manquant : ${page.url}`);
    else if (new URL(page.canonical).pathname !== page.url) fail(`canonical ${page.canonical} ≠ ${page.url}`);
}

// 4. Sitemap = indexable pages.
const sitemapFiles = files.filter((f) => /sitemap-\d+\.xml$/.test(f));
const inSitemap = new Set(sitemapFiles.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)));
if (!sitemapFiles.length) fail('sitemap absent');
for (const page of indexable) if (!inSitemap.has(page.url)) fail(`absente du sitemap : ${page.url}`);
for (const url of inSitemap) {
    const page = pages.find((p) => p.url === url);
    if (!page) fail(`sitemap : page inexistante ${url}`);
    else if (!isIndexable(page)) fail(`sitemap : page noindex ${url}`);
}

// 5. robots.txt, 404.
const robots = existsSync(join(DIST, 'robots.txt')) ? readFileSync(join(DIST, 'robots.txt'), 'utf8') : '';
if (!robots) fail('robots.txt absent');
if (production && !robots.includes('Sitemap:')) fail('robots.txt de production sans Sitemap');
if (!existsSync(join(DIST, '404.html'))) fail('404.html absent');

// 6. Drafts are never built.
const blogDir = join(ROOT, 'src/content/blog');
for (const name of readdirSync(blogDir).filter((n) => n.endsWith('.md'))) {
    const text = readFileSync(join(blogDir, name), 'utf8');
    const slug = (text.match(/^slug:\s*"?([^"\n]+)"?$/m) ?? [])[1];
    if (/^draft:\s*true$/m.test(text) && slug && existsSync(join(DIST, 'blog', slug))) fail(`brouillon publié : ${slug}`);
}

// 7. No orphan: every indexable page is linked from another page.
const linkedTo = new Set(pages.flatMap((p) => p.links.filter((h) => h.startsWith('/')).map((h) => h.split('#')[0].split('?')[0]).filter((h) => h !== p.url)));
for (const page of indexable) if (page.url !== '/' && !linkedTo.has(page.url)) fail(`page orpheline (aucun lien interne) : ${page.url}`);

// 8. Production: no placeholder left, every page indexable except the expected ones.
if (production) {
    for (const page of pages) {
        if (/\[À (COMPLÉTER|VALIDER)/.test(page.html)) fail(`texte à compléter en production : ${page.url}`);
    }
    for (const page of pages) {
        if (isIndexable(page) && page.robots.includes('noindex')) fail(`noindex inattendu en production : ${page.url}`);
        if (!isIndexable(page) && !page.robots.includes('noindex')) fail(`page à exclure sans noindex : ${page.url}`);
    }
}

if (problems.length) {
    console.error(`✗ ${problems.length} problème(s) :\n  ` + problems.join('\n  '));
    process.exit(1);
}
console.log(`✓ ${pages.length} pages vérifiées (${indexable.length} indexables, ${inSitemap.size} dans le sitemap)${production ? ' — mode production' : ''}`);
