# OpenSEO — ce qui a été vérifié (26 octobre 2026)

## Identité

- Dépôt officiel : <https://github.com/every-app/open-seo> (lu via jsDelivr, branche `main`).
- Licence : **MIT** (« Copyright (c) 2026 Ben Senescu », fichier `LICENSE`). Réutilisation et modification permises,
  avec la mention de licence.
- Version hébergée payante sur openseo.so (abonnement + majoration des requêtes DataForSEO, selon le README) ;
  l'auto-hébergement ne coûte que l'usage DataForSEO.

## Ce que c'est

Une **application web complète** (alternative à Semrush/Ahrefs) : recherche de mots-clés, recherche de domaine,
liens entrants, suivi de positions, audit de site, intégration Google Search Console, visibilité IA. Les données
viennent de **DataForSEO** (clé fournie par l'utilisateur).

Pile technique (`package.json`) : React 19, TanStack Start / Router / Query, Vite, Drizzle ORM (D1 SQLite ou
PostgreSQL), better-auth, Cloudflare Workers (`wrangler`, `agents`, `@cloudflare/workers-oauth-provider`),
gestionnaire `pnpm`. Déploiement : `wrangler deploy` sur un compte Cloudflare (plan gratuit annoncé) ou Docker
(Compose). Accès : comptes e-mail/mot de passe, ou sans connexion derrière un proxy authentifiant
(Cloudflare Access cité par le README).

Interfaces exposées : l'interface web et un **serveur MCP** (pour des agents IA). Le README ne documente **ni API
REST, ni ligne de commande** utilisables depuis un script ou GitHub Actions. Les points d'appel DataForSEO précis ne
sont pas listés dans le README (à lire dans `src/` si besoin).

## Décision

| Besoin du projet | Choix | Raison |
|---|---|---|
| Recherche quotidienne automatique (GitHub Actions) | **Client DataForSEO maison** (`scripts/seo/dataforseo.mjs`) | OpenSEO n'a pas d'interface de script documentée ; l'embarquer (Workers + base + auth) dans un job CI serait disproportionné. Notre client est petit, testé, avec budget et cache. |
| Exploration interactive des mots-clés, concurrents, positions | **OpenSEO auto-hébergé (optionnel)**, sur un projet Cloudflare séparé, derrière Cloudflare Access | Il le fait déjà bien ; aucun code à réécrire. Le site public n'en dépend jamais. |
| Planification éditoriale (clusters, cannibalisation, briefs, statuts, offre A/B) | **Tableau de bord maison** (`dashboard/`) | Spécifique à ce site et à ses articles Markdown ; absent d'OpenSEO. |
| Agents IA (Claude Code…) | Serveur MCP d'OpenSEO, si installé | Utile pour l'exploration manuelle, pas pour la publication automatique. |

## Si OpenSEO est installé

1. Suivre `docs/SELF_HOSTING_DOCKER.md` ou le déploiement Cloudflare du dépôt OpenSEO (projet distinct de celui du site).
2. Mettre Cloudflare Access devant, avec les mêmes règles que le tableau de bord (`docs/DEPLOIEMENT.md`).
3. Utiliser **le même compte DataForSEO**, mais tenir compte de sa consommation dans le budget mensuel
   (`SEO_MONTHLY_BUDGET_USD`) : nos compteurs ne voient pas ses requêtes.
4. Les mots-clés trouvés dans OpenSEO s'ajoutent à la base du site par `npm run seo:import -- fichier.csv`
   (export CSV d'OpenSEO ; colonnes reconnues : keyword, volume/search_volume, difficulty/keyword_difficulty, cpc).
