# Plan — site vitrine et SEO « Inventaire rapide des archives »

## Principes

- Projet **séparé** : tout est dans `website/` et `.github/workflows/website-*.yml`. Aucun fichier de l'application
  (`backend/`, `mobile/`, `ocr-worker/`, `windows-ocr/`, `portable/`, `bundle/`, `docker/`) n'est modifié.
- Le site ne dit que ce que prouve [`FEATURES-VERIFIED.md`](FEATURES-VERIFIED.md). Pas de clients, logos,
  témoignages, chiffres ou certifications inventés. Les coordonnées de la société sont des réglages
  (`PUBLIC_*`), jamais inventées ; le build de production échoue tant qu'elles manquent.
- Le site public est statique et ne dépend d'aucun service externe pour s'afficher (recherche de mots-clés,
  IA, DataForSEO ou OpenSEO en panne = le site continue).

## Architecture

| Partie | Technique | Où |
|---|---|---|
| Site public | Astro (sortie statique), Tailwind 4, polices Noto auto-hébergées, collections Markdown validées par schéma | `website/src/` → `website/dist/` |
| Hébergement | Cloudflare Pages, racine du projet `website/` | `website/wrangler.toml` |
| `noindex` hors production | Pages Function `_middleware` (en-tête `X-Robots-Tag`) selon l'hôte + balise meta au build | `website/functions/_middleware.ts` |
| Formulaires de contact | Pages Function `POST /api/lead` : validation serveur, Turnstile, pot de miel, limite de débit, stockage D1 et/ou e-mail (Resend) | `website/functions/api/lead.ts` |
| Recherche de mots-clés | Scripts Node exécutés par GitHub Actions ; DataForSEO en direct (budget, cache, mode à blanc) | `website/scripts/seo/` |
| Base de mots-clés | JSON versionné | `website/research/` |
| Rédaction | API Claude (Anthropic), clé côté GitHub Actions seulement | `website/scripts/seo/generate-article.mjs` |
| Porte qualité | contrôles automatiques + seconde relecture IA indépendante | `website/scripts/seo/quality-gate.mjs` |
| Publication quotidienne | workflow planifié : publie si la porte qualité passe, sinon PR `needs-review` | `.github/workflows/website-daily-article.yml` |
| Tableau de bord privé | projet Cloudflare Pages séparé derrière Cloudflare Access ; JWT Access vérifié côté serveur | `website/dashboard/` |
| OpenSEO | outil interactif optionnel, auto-hébergé à part (voir `OPENSEO.md`) | — |

## Étapes (ordre de réalisation)

1. Fondations : inventaire des fonctionnalités, captures réelles (scripts e2e existants, données d'exemple),
   squelette Astro, accueil, pages produit, sur-mesure, solutions, contact, pages légales, métadonnées SEO.
2. Blog et SEO technique : collection d'articles, pages articles, plan du site, robots, données structurées,
   liens internes, 5 à 8 premiers articles sourcés, formulaire fonctionnel.
3. Recherche de mots-clés : client DataForSEO (budget, cache, mode à blanc), base de mots-clés, tableau de bord.
4. Automatisation : calendrier, briefs, rédaction, porte qualité, publication quotidienne, PR de relecture,
   résumé quotidien, dépublication.
5. Optimisation (après mise en ligne, avec des données réelles) : Search Console, conversions, version arabe.

## Tests

- `npm test` (Vitest) : magasin de mots-clés, budget, client DataForSEO (réponses simulées), porte qualité
  (articles volontairement défectueux), formulaire (handler avec environnement simulé).
- `npm run check:site` après `npm run build` : liens internes, métadonnées uniques, canonicals, plan du site,
  robots, brouillons absents, 404, pages orphelines.
- Playwright (déjà dans `e2e/`) : rendu mobile et formulaire contre `wrangler pages dev`.
