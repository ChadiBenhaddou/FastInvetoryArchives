import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { isProduction, missingProductionSettings, site } from './src/config/site.mjs';

if (isProduction && missingProductionSettings().length) {
    throw new Error(
        `Build de production refusé : réglages manquants ${missingProductionSettings().join(', ')} ` +
            '(Cloudflare Pages → Settings → Environment variables). Aucune coordonnée n\'est inventée.',
    );
}

// Pages never listed in the sitemap (thank-you pages, 404).
const NOT_IN_SITEMAP = ['/404/'];

export default defineConfig({
    site: site.url,
    trailingSlash: 'always',
    build: { format: 'directory' },
    // French now; Arabic pages (/ar/, RTL) are published only once written and reviewed.
    i18n: { defaultLocale: 'fr', locales: ['fr', 'ar'], routing: { prefixDefaultLocale: false } },
    integrations: [
        sitemap({
            filter: (page) => !NOT_IN_SITEMAP.some((p) => new URL(page).pathname.endsWith(p)),
        }),
    ],
    vite: { plugins: [tailwindcss()] },
});
