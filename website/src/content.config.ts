import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Frontmatter of every article (the build fails on an invalid one). The same rules are checked by the
// quality gate before an automatic publication (scripts/seo/article-schema.mjs).
const blog = defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
    schema: z.object({
        title: z.string().min(20).max(70),
        description: z.string().min(70).max(160),
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        pubDate: z.coerce.date(),
        updatedDate: z.coerce.date().optional(),
        author: z.string().min(2),
        category: z.enum([
            'inventaire-recolement',
            'classement-description',
            'archives-administratives',
            'archivage-physique-numerique',
            'numerisation-ocr-recherche',
            'conservation-elimination',
            'reglementation-maroc',
            'organisation-couts',
            'logiciels-outils',
            'transformation-numerique',
            'applications-sur-mesure',
        ]),
        tags: z.array(z.string()).max(8).default([]),
        primaryKeyword: z.string().min(3),
        secondaryKeywords: z.array(z.string()).max(10).default([]),
        offer: z.enum(['inventaire', 'sur-mesure']),
        draft: z.boolean().default(false),
        sources: z.array(z.object({ title: z.string(), url: z.url() })).default([]),
        canonicalURL: z.url().optional(),
    }),
});

export const collections = { blog };
