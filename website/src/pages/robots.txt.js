import { isProduction, site } from '../config/site.mjs';

// Production: everything open, with the sitemap. Previews and local builds: pages carry noindex
// (meta + X-Robots-Tag), so crawling stays allowed for them to see it; the API is never crawled.
export function GET() {
    const lines = ['User-agent: *', 'Disallow: /api/', 'Disallow: /merci/'];
    if (isProduction) lines.push('', `Sitemap: ${site.url}/sitemap-index.xml`);
    return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
