// Writes one French article from a brief with Claude. The reference context (verified features,
// verified sources, style rules, internal pages, existing articles) is the cached system part;
// the brief (and, on a retry, the gate's findings) is the variable part.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALLOWED_SOURCE_DOMAINS, DOCS, settings } from './config.mjs';
import { CATEGORIES } from './article-schema.mjs';
import { callJson } from './llm.mjs';

export const ARTICLE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'description', 'category', 'tags', 'secondaryKeywords', 'sources', 'body'],
    properties: {
        title: { type: 'string', description: 'Titre, 20 à 70 caractères, sans le nom du site' },
        description: { type: 'string', description: 'Méta-description, 70 à 160 caractères' },
        category: { type: 'string', enum: CATEGORIES },
        tags: { type: 'array', items: { type: 'string' }, description: '3 à 6 étiquettes courtes' },
        secondaryKeywords: { type: 'array', items: { type: 'string' }, description: '2 à 6 mots-clés secondaires' },
        sources: {
            type: 'array',
            items: { type: 'object', additionalProperties: false, required: ['title', 'url'], properties: { title: { type: 'string' }, url: { type: 'string' } } },
        },
        body: { type: 'string', description: 'Corps de l’article en Markdown, sans titre H1, sans frontmatter' },
    },
};

export const STYLE = `Tu écris des articles pour le site « Inventaire rapide des archives » (logiciel d'inventaire d'archives hors
ligne, arabe et français, et applications sur mesure), pour des organisations au Maroc : administrations, collectivités,
entreprises, prestataires d'archivage, archivistes.

Règles impératives :
1. Français naturel et professionnel, phrases claires, vocabulaire du métier des archives. Pas de remplissage, pas de
   formules creuses (« dans un monde en constante évolution »…), pas de bourrage de mots-clés.
2. Valeur pratique : méthode, étapes, critères, erreurs à éviter, exemples concrets. Le lecteur doit pouvoir agir.
3. Structure : introduction courte, 4 à 7 sections ## (### si utile), listes et tableaux quand ils aident. Pas de #.
   900 à 1 800 mots.
4. Aucun chiffre, statistique, pourcentage, citation, étude, client ou témoignage inventé. Un chiffre n'est permis que
   s'il figure dans la référence ci-dessous (avec ses conditions) ou dans une source citée.
5. Faits réglementaires (lois, décrets, articles, délais, obligations) : uniquement ceux de « Sources vérifiées »
   ci-dessous, avec la source dans "sources". Ne jamais présenter un avis comme une obligation légale. Séparer les faits
   des recommandations. Ajouter que les textes officiels en vigueur font foi quand le sujet touche au droit.
6. Produit : ne mentionner que des fonctionnalités de « Fonctionnalités vérifiées », et leurs limites quand c'est
   utile. Applications sur mesure : toujours présentées comme un service sur demande, jamais comme des produits
   existants ni des références réalisées.
7. Liens internes : au moins 3 liens Markdown vers des pages de la liste « Pages du site » (chemins exacts, avec le / final),
   dont un lien d'appel à l'action adapté à l'offre visée, placé naturellement en fin d'article.
8. Liens externes et sources : seulement des URL réelles que tu connais avec certitude sur les domaines ${ALLOWED_SOURCE_DOMAINS.join(', ')}.
   En cas de doute, pas de lien externe : "sources" peut être vide si l'article ne contient aucun fait réglementaire ni chiffre.
9. Ne pas reprendre un sujet déjà traité par un article existant (liste ci-dessous) : y renvoyer par un lien.`;

export function referenceContext({ sitePaths, posts }) {
    const features = readFileSync(join(DOCS, 'FEATURES-VERIFIED.md'), 'utf8');
    const sources = readFileSync(join(DOCS, 'SOURCES-VERIFIEES.md'), 'utf8');
    const existing = posts.filter((p) => !p.data.draft).map((p) => `- /blog/${p.data.slug}/ — ${p.data.title} (mot-clé : ${p.data.primaryKeyword})`).join('\n');
    // No date or per-run value in it: the cached prefix stays byte-identical from one day to the next.
    return `# Fonctionnalités vérifiées\n\n${features}\n\n# Sources vérifiées\n\n${sources}\n\n# Pages du site\n\n${sitePaths.join('\n')}\n\n# Articles existants\n\n${existing}`;
}

export async function generateArticle(brief, { sitePaths, posts, feedback = null, call = callJson }) {
    const input = [
        'Rédige l’article correspondant à ce brief.',
        '```json', JSON.stringify(brief, null, 2), '```',
        feedback ? `\nLa version précédente a été refusée par la porte qualité. Corrige ces problèmes :\n${feedback}` : '',
    ].join('\n');
    const { data, costUsd, model } = await call({
        model: settings.writerModel,
        purpose: 'writer',
        instructions: STYLE,
        reference: referenceContext({ sitePaths, posts }),
        input,
        schema: ARTICLE_SCHEMA,
        effort: 'high',
        maxTokens: 32000,
    });
    const today = new Date().toISOString().slice(0, 10);
    const frontmatter = {
        title: data.title.trim(),
        description: data.description.trim(),
        slug: brief.slug,
        pubDate: today,
        author: settings.authorName,
        category: data.category,
        tags: data.tags.slice(0, 8),
        primaryKeyword: brief.primaryKeyword,
        secondaryKeywords: [...new Set([...(brief.secondaryKeywords ?? []), ...data.secondaryKeywords])].slice(0, 10),
        offer: brief.offer,
        draft: true, // the publishing step decides
        sources: data.sources,
    };
    return { data: frontmatter, body: data.body.trim(), costUsd, model };
}
