# Site web — Inventaire rapide des archives

Site vitrine et SEO (français, Maroc) de deux offres. Il ne collecte aucune donnée personnelle :
pas de formulaire, pas de cookie ; les visiteurs contactent par WhatsApp, téléphone ou e-mail.

Les deux offres :

- **A — Inventaire rapide des archives** : le logiciel hors ligne de ce dépôt (photos de boîtes →
  OCR → recherche), présenté uniquement avec des fonctionnalités prouvées
  ([docs/FEATURES-VERIFIED.md](docs/FEATURES-VERIFIED.md)).
- **B — Développement d'applications sur mesure**, sur demande.

Projet séparé : rien ici n'est utilisé par l'application, et l'application n'est pas modifiée.

## Contenu

| Dossier | Rôle |
|---|---|
| `src/` | site Astro statique : pages, 8 articles (`src/content/blog/`), composants, captures d'écran réelles |
| `functions/` | `noindex` hors domaine principal (le site n'a pas de formulaire : contact par WhatsApp, téléphone, e-mail) |
| `scripts/check-site.mjs` | vérifications SEO du build (liens, doublons, canonicals, sitemap, textes à compléter…) |
| `scripts/seo/` | recherche DataForSEO, base de mots-clés, planification, rédaction IA, porte qualité, publication, retrait |
| `research/` | données SEO commitées (mots-clés, publications, coûts) ; `research/cache/` n'est pas commité |
| `dashboard/` | tableau de bord SEO privé (projet Cloudflare Pages séparé, derrière Cloudflare Access) |
| `scripts/screenshots/` | captures de l'application mobile et images de marque |
| `tests/` | tests vitest |
| `docs/` | plan, preuves, sources, guides |

## Commandes (Node ≥ 22.23.4)

```
npm ci
npm run dev              # http://localhost:4321
npm test                 # 31 tests
npm run build:pages      # build + vérifications du site
npm run seo:research -- --estimate   # essai DataForSEO sans frais (SEO_LIVE=false par défaut)
npm run seo:article      # pipeline quotidien (nécessite ANTHROPIC_API_KEY)
npm run seo:gate -- src/content/blog/<slug>.md --no-ai   # porte qualité sur un article
npm run seo:unpublish -- <slug> "raison"
npm run dashboard:build
```

Variables : [.env.example](.env.example).

## Guides

- [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) — Cloudflare Pages (site + tableau de bord), Access
- [docs/CONFIGURATION-EXTERNE.md](docs/CONFIGURATION-EXTERNE.md) — tout ce qui reste à configurer hors du code (identité, comptes, clés)
- [docs/PUBLICATION-AUTOMATIQUE.md](docs/PUBLICATION-AUTOMATIQUE.md) — article quotidien, porte qualité, retrait, coûts
- [docs/DATAFORSEO.md](docs/DATAFORSEO.md) — recherche de mots-clés Maroc, budget, cache
- [docs/OPENSEO.md](docs/OPENSEO.md) — évaluation d'OpenSEO et usage retenu
- [docs/FEATURES-VERIFIED.md](docs/FEATURES-VERIFIED.md) — ce que le site a le droit d'affirmer
- [docs/SOURCES-VERIFIEES.md](docs/SOURCES-VERIFIEES.md) — textes juridiques vérifiés
- [docs/PLAN.md](docs/PLAN.md) — plan et phases

## Règles de contenu

- Aucune fonctionnalité, chiffre ou référence client non prouvé. Chiffres de performance toujours
  avec leurs conditions de mesure.
- Licences dites honnêtement (Docker Desktop, OCR Windows).
- Les sujets juridiques passent toujours par une relecture humaine.
- Pas de fausses notes ni de faux avis dans les données structurées.
