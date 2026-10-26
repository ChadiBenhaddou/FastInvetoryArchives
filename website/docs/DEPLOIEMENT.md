# Déploiement — Cloudflare Pages

Deux projets Cloudflare Pages distincts, reliés au même dépôt GitHub :

| Projet | Racine | Commande de build | Sortie | Public ? |
|---|---|---|---|---|
| `inventaire-archives-site` | `website` | `npm ci && npm run build:pages` | `dist` | oui |
| `inventaire-archives-seo-dashboard` | `website/dashboard` | `cd .. && npm ci && npm run dashboard:build` | `dist` | non (Cloudflare Access) |

Version de Node : variable `NODE_VERSION=22.23.4` sur les deux projets (Astro 7 exige ≥ 22.23.4 ;
le fichier `.nvmrc` donne la même version).

Le reste du dépôt (application hors ligne : `backend/`, `mobile/`, `portable/`…) n'est ni construit
ni publié par ces projets.

## 1. Site public

1. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → ce dépôt.
2. Branche de production : `main`. Racine : `website`. Build : `npm ci && npm run build:pages`.
   Sortie : `dist`. Le dossier `website/functions/` (formulaire, en-têtes `noindex`) est détecté seul.
3. Build watch paths (Settings → Builds) : inclure `website/*` pour ne pas reconstruire à chaque
   modification de l'application.
4. Variables (Production) : toutes les `PUBLIC_*` de [CONFIGURATION-EXTERNE.md](CONFIGURATION-EXTERNE.md),
   `NODE_VERSION`. Secrets : `TURNSTILE_SECRET_KEY`, `LEADS_IP_SALT`, et si e-mail `RESEND_API_KEY`,
   `LEADS_TO_EMAIL`, `LEADS_FROM_EMAIL`.
   Sur l'environnement Preview, ne mettez pas `SITE_ENV=production` : les aperçus restent `noindex`.
5. D1 :
   ```
   npx wrangler d1 create inventaire-archives-leads        # copier database_id dans wrangler.toml
   npx wrangler d1 migrations apply inventaire-archives-leads --remote
   ```
   Le binding `LEADS_DB` est déclaré dans `wrangler.toml`.
6. Domaine personnalisé (Custom domains) → mettre la même adresse dans `PUBLIC_SITE_URL`.
   Toute autre adresse (`*.pages.dev`, aperçus) reçoit `X-Robots-Tag: noindex` (`functions/_middleware.ts`).
7. Redéployer, puis contrôler : `/robots.txt` contient la ligne `Sitemap:`, `/sitemap-index.xml`
   existe, le formulaire de `/contact/` enregistre une demande (`npx wrangler d1 execute
   inventaire-archives-leads --remote --command "select id, created_at, type from leads"`).

### Garde-fous du build

- `SITE_ENV=production` (ou branche de production sur Cloudflare) sans `PUBLIC_SITE_URL`,
  `PUBLIC_ORG_NAME`, `PUBLIC_CONTACT_EMAIL`, `PUBLIC_PUBLISHER_NAME` → build refusé.
- `scripts/check-site.mjs` (lancé par `build:pages`) échoue en production s'il reste « [À COMPLÉTER »
  sur une page, et à chaque build si un lien interne est cassé, un titre/une description en double,
  une page orpheline, un brouillon publié, un canonical faux ou le sitemap incohérent.

## 2. Tableau de bord SEO privé

1. Nouveau projet Pages sur le même dépôt. Racine : `website/dashboard`.
   Build : `cd .. && npm ci && npm run dashboard:build`. Sortie : `dist`.
2. Domaine : par exemple `seo.<votre-domaine>` (un domaine personnalisé est nécessaire pour Access
   sur tout le trafic ; protégez aussi `*.inventaire-archives-seo-dashboard.pages.dev`).
3. Cloudflare Zero Trust → Access → Applications → Self-hosted : le domaine du tableau de bord,
   politique « Allow » limitée aux e-mails des administrateurs. Copier l'**Application Audience (AUD)
   tag**.
4. Variables du projet : `ACCESS_TEAM_DOMAIN` (`<equipe>.cloudflareaccess.com`), `ACCESS_AUD`,
   `DASHBOARD_ADMINS`, `GITHUB_REPOSITORY`, `GITHUB_REF` ; secret `GITHUB_DISPATCH_TOKEN`.
5. Double contrôle : Access filtre à l'entrée **et** chaque requête est revérifiée côté serveur
   (`functions/_middleware.ts` vérifie la signature RS256 du jeton Access, l'audience, l'émetteur et
   l'expiration). Sans `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`, tout est refusé (403).
6. Les boutons (« Lancer l'article du jour », « Retirer », « Recherche ») appellent `/api/dispatch`,
   qui vérifie l'e-mail dans `DASHBOARD_ADMINS`, limite le débit (KV optionnel) puis déclenche le
   workflow GitHub correspondant. Le jeton GitHub ne quitte jamais le serveur.

Les données du tableau de bord (`data.json`) sont calculées au build depuis `research/` et les
articles : il se met à jour à chaque commit sur `main` (recherche ou article du jour).

## 3. GitHub Actions

Voir [PUBLICATION-AUTOMATIQUE.md](PUBLICATION-AUTOMATIQUE.md). En bref : environnement
`seo-automation` avec les secrets API, variables de dépôt, droit pour Actions de créer des pull
requests.

## 4. Test local complet

```
npm ci
npm test
npm run build:pages
npx wrangler d1 migrations apply inventaire-archives-leads --local
npx wrangler pages dev dist          # formulaire avec les clés Turnstile de test (.dev.vars)
npm run dashboard:build              # puis servir dashboard/dist pour voir l'interface
```
