import { site } from '../config/site.mjs';
import { postPath, publishedPosts } from '../lib/posts.mjs';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function GET() {
    const posts = (await publishedPosts()).slice(0, 30);
    const items = posts
        .map((p) => {
            const url = new URL(postPath(p), site.url).href;
            return `<item><title>${esc(p.data.title)}</title><link>${url}</link><guid>${url}</guid><pubDate>${p.data.pubDate.toUTCString()}</pubDate><description>${esc(p.data.description)}</description></item>`;
        })
        .join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(site.productName)}</title><link>${site.url}/blog/</link><description>Guides sur la gestion des archives et les applications sur mesure</description><language>fr</language>${items}</channel></rss>`;
    return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
