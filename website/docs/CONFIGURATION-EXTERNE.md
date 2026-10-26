# Configuration externe — ce qui reste à faire hors du code

Tout ce qui suit demande un compte, une décision ou une information que le code ne peut pas
inventer. Tant qu'un point bloquant n'est pas fait, le build de production refuse de démarrer ou les
vérifications du site échouent : un site incomplet ne part pas en ligne par accident.

## 1. Bloquant avant la mise en ligne

| Quoi | Où | Pourquoi |
|---|---|---|
| Raison sociale, forme, adresse, ville, RC, ICE, téléphone, e-mail, directeur de la publication | Cloudflare Pages (site) → variables `PUBLIC_ORG_*`, `PUBLIC_CONTACT_*`, `PUBLIC_PUBLISHER_NAME` | Mentions légales, schéma Organization, pages contact. Sinon « [À COMPLÉTER] » et build refusé. |
| Nom de domaine | Cloudflare → domaine personnalisé du projet site, puis `PUBLIC_SITE_URL` | Canonicals, sitemap, robots, `noindex` hors domaine principal. |
| Déclaration CNDP du traitement « prospects » (formulaire de déclaration normale) | cndp.ma, puis `PUBLIC_CNDP_REFERENCE` | Loi 09-08. Sans référence, la vérification de production échoue. |
| Transfert de données hors du Maroc (Cloudflare, Resend) | Avis/autorisation CNDP, puis `PUBLIC_CNDP_TRANSFERS_VALIDATED=true` | Tant que ce n'est pas `true`, la politique de confidentialité l'indique honnêtement. |
| Durée de conservation des demandes | `PUBLIC_LEAD_RETENTION_MONTHS` (défaut 24) | Appliquée automatiquement (effacement à chaque nouvelle demande). |
| Relecture juridique de la politique de confidentialité et des mentions légales | Juriste | Les textes sont des bases sérieuses, pas un avis juridique. |

## 2. Formulaire de contact

| Quoi | Où |
|---|---|
| Base D1 `inventaire-archives-leads` (`npx wrangler d1 create …`), id dans `wrangler.toml`, migration `npx wrangler d1 migrations apply inventaire-archives-leads --remote` | Cloudflare |
| Widget Turnstile (domaine du site) : clé publique `PUBLIC_TURNSTILE_SITE_KEY`, secret `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile |
| `LEADS_IP_SALT` (longue chaîne aléatoire, secret) | Cloudflare Pages (site) |
| Optionnel — notification e-mail : compte Resend, domaine d'envoi vérifié, `RESEND_API_KEY`, `LEADS_FROM_EMAIL`, `LEADS_TO_EMAIL` | resend.com + Cloudflare Pages |

Au moins une destination (D1 ou e-mail) est obligatoire : sinon le formulaire répond « service
indisponible » au lieu de faire semblant d'avoir reçu la demande.

## 3. Automatisation SEO (GitHub)

| Quoi | Où |
|---|---|
| Environnement GitHub `seo-automation` avec les secrets `ANTHROPIC_API_KEY`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | GitHub → Settings → Environments |
| Variables de dépôt : `PUBLIC_SITE_URL`, `PUBLIC_ORG_NAME`, `PUBLIC_CONTACT_EMAIL`, `PUBLIC_PUBLISHER_NAME`, `PUBLIC_CNDP_REFERENCE`, `PUBLIC_CNDP_TRANSFERS_VALIDATED` (build de contrôle), et au besoin `AUTO_PUBLISH`, `MAX_ARTICLES_PER_DAY`, `PUBLISH_HOUR`, budgets `SEO_*` | GitHub → Settings → Variables |
| Actions autorisées à créer des pull requests | GitHub → Settings → Actions → General → « Allow GitHub Actions to create and approve pull requests » |
| Compte DataForSEO approvisionné (prépayé) | dataforseo.com — voir [DATAFORSEO.md](DATAFORSEO.md) |
| Clé API Anthropic avec une limite de dépense mensuelle côté console | console.anthropic.com |
| S'abonner (« Watch ») à l'issue « Résumé SEO quotidien » pour recevoir le résumé par e-mail | GitHub |

Si la branche principale est protégée, le workflow quotidien ne peut pas y pousser : soit autoriser
`github-actions[bot]`, soit mettre `AUTO_PUBLISH=false` (tout passe alors par pull request).

## 4. Tableau de bord privé

| Quoi | Où |
|---|---|
| Second projet Cloudflare Pages (racine `website/dashboard`) | Cloudflare |
| Application Cloudflare Access sur son domaine, politique « e-mails autorisés » | Cloudflare Zero Trust |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `DASHBOARD_ADMINS` | Cloudflare Pages (tableau de bord) |
| Jeton GitHub à portée fine (ce dépôt seulement, permission Actions : lecture/écriture) → `GITHUB_DISPATCH_TOKEN`, plus `GITHUB_REPOSITORY`, `GITHUB_REF` | GitHub + Cloudflare Pages |
| Optionnel : KV `DASHBOARD_KV` pour limiter le nombre d'actions par heure | Cloudflare |

## 5. Après la mise en ligne

- Google Search Console : vérifier le domaine (DNS, ou `PUBLIC_GOOGLE_SITE_VERIFICATION`), soumettre
  `https://<domaine>/sitemap-index.xml`.
- Bing Webmaster Tools : importer depuis Search Console.
- Optionnel : Cloudflare Web Analytics (`PUBLIC_CF_ANALYTICS_TOKEN`, sans cookie).
- Remplacer l'auteur collectif « Équipe … » par une personne réelle quand c'est possible (`PUBLIC_AUTHOR_NAME`, `SEO_AUTHOR_NAME`).

## 6. Plus tard

- Version arabe (`/ar/`, hreflang) : l'i18n est déclarée, les pages ne sont pas encore traduites.
- Captures d'écran sur de vraies données client : jamais sans accord écrit ; les captures actuelles
  utilisent les données d'exemple.
