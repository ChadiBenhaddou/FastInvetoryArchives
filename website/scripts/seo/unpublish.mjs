// Takes an article off the site: draft: true + updatedDate, logged. The page disappears at the next
// deployment (drafts are never built). Run by the "website-unpublish" workflow (one click in Actions).
//
//   node scripts/seo/unpublish.mjs <slug> ["raison"]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BLOG } from './config.mjs';
import { joinFrontmatter, loadPosts } from './content.mjs';
import { PUBLICATIONS } from './daily-article.mjs';

export function unpublish(slug, reason = 'retrait manuel', { today = new Date().toISOString().slice(0, 10), dir = BLOG, logFile = PUBLICATIONS } = {}) {
    const post = loadPosts(dir).find((p) => p.data.slug === slug);
    if (!post) throw new Error(`article introuvable : ${slug}`);
    if (post.data.draft) return { changed: false, file: post.file };
    writeFileSync(post.file, joinFrontmatter({ ...post.data, draft: true, updatedDate: today }, post.body), 'utf8');
    const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf8')) : [];
    log.push({ date: today, slug, url: `/blog/${slug}/`, mode: 'unpublish', reason });
    writeFileSync(logFile, JSON.stringify(log, null, 2) + '\n');
    return { changed: true, file: post.file };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [slug, reason] = process.argv.slice(2);
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
        console.error('usage : node scripts/seo/unpublish.mjs <slug> ["raison"]');
        process.exit(2);
    }
    const { changed, file } = unpublish(slug, reason);
    console.log(changed ? `Retiré (brouillon) : ${file}` : `Déjà en brouillon : ${file}`);
}
