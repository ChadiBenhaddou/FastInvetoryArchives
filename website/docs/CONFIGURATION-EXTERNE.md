# Configuration externe — ce qui reste à faire hors du code

Tout ce qui suit demande un compte, une décision ou une information que le code ne peut pas
inventer. Tant que les réglages obligatoires manquent, le build de production refuse de démarrer :
un site incomplet ne part pas en ligne par accident.

Le site **n'a pas de formulaire et ne collecte aucune donnée personnelle** (décision du 27/10/2026) :
pas de base de données, pas d'anti-spam, pas de service d'e-mail à configurer. Les visiteurs
contactent par WhatsApp (message prérempli), téléphone ou e-mail.

## 1. Avant la mise en ligne

| Quoi | Où | Obligatoire ? |
|---|---|---|
| `PUBLIC_SITE_URL` : adresse du site (au début `https://inventaire-archives-site.pages.dev`, puis votre domaine) | Cloudflare Pages (site) | oui |
| `PUBLIC_PUBLISHER_NAME` : personne responsable du site (mentions légales) | Cloudflare Pages (site) | oui |
| `PUBLIC_CONTACT_PHONE` et/ou `PUBLIC_CONTACT_EMAIL` | Cloudflare Pages (site) | au moins un |
| `PUBLIC_WHATSAPP=false` si le numéro n'est pas sur WhatsApp | Cloudflare Pages (site) | non |
| Société : `PUBLIC_ORG_NAME`, `PUBLIC_ORG_LEGAL_FORM`, `PUBLIC_ORG_ADDRESS`, `PUBLIC_ORG_CITY`, `PUBLIC_ORG_RC`, `PUBLIC_ORG_ICE` | Cloudflare Pages (site) | non — sans société, le site est édité au nom de la personne responsable |
| Nom de domaine | Cloudflare → domaine personnalisé du projet, puis `PUBLIC_SITE_URL` | non (l'adresse `.pages.dev` fonctionne) |

Loi 09-08 : le site lui-même ne traite pas de données personnelles. Si vous gardez un fichier de
clients ou de prospects (Excel, contacts), c'est un traitement de votre activité, indépendant du site.

## 2. Automatisation SEO (GitHub)

| Quoi | Où |
|---|---|
| Environnement GitHub `seo-automation` avec les secrets `ANTHROPIC_API_KEY`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | GitHub → Settings → Environments |
| Variables de dépôt : `PUBLIC_SITE_URL`, `PUBLIC_PUBLISHER_NAME`, `PUBLIC_CONTACT_PHONE` (mêmes valeurs que sur Cloudflare, pour le build de contrôle), `AUTO_PUBLISH` (`false` au début), au besoin `MAX_ARTICLES_PER_DAY`, `PUBLISH_HOUR`, budgets `SEO_*` | GitHub → Settings → Secrets and variables → Actions → Variables |
| Actions autorisées à créer des pull requests | GitHub → Settings → Actions → General → « Allow GitHub Actions to create and approve pull requests » |
| Compte DataForSEO approvisionné (prépayé) | dataforseo.com — voir [DATAFORSEO.md](DATAFORSEO.md) |
| Clé API Anthropic avec une limite de dépense mensuelle | console.anthropic.com |
| Suivre (« Watch ») l'issue « Résumé SEO quotidien » pour recevoir le résumé par e-mail | GitHub |

Si la branche principale est protégée, le workflow quotidien ne peut pas y pousser : soit autoriser
`github-actions[bot]`, soit garder `AUTO_PUBLISH=false` (tout passe alors par pull request).

## 3. Tableau de bord privé (facultatif)

| Quoi | Où |
|---|---|
| Second projet Cloudflare Pages (racine `website/dashboard`) | Cloudflare |
| Application Cloudflare Access sur son adresse, politique « e-mails autorisés » | Cloudflare Zero Trust |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `DASHBOARD_ADMINS` | Cloudflare Pages (tableau de bord) |
| Jeton GitHub à portée fine (ce dépôt seulement, Actions : lecture/écriture) → `GITHUB_DISPATCH_TOKEN`, plus `GITHUB_REPOSITORY`, `GITHUB_REF` | GitHub + Cloudflare Pages |
| Optionnel : KV `DASHBOARD_KV` pour limiter le nombre d'actions par heure | Cloudflare |

## 4. Après la mise en ligne

- Google Search Console : ajouter le site (préfixe d'URL, vérification par balise →
  `PUBLIC_GOOGLE_SITE_VERIFICATION`), soumettre `https://<adresse>/sitemap-index.xml`.
- Bing Webmaster Tools : importer depuis Search Console.
- Optionnel : Cloudflare Web Analytics (`PUBLIC_CF_ANALYTICS_TOKEN`, sans cookie).

## 5. Plus tard

- Version arabe (`/ar/`, hreflang) : l'i18n est déclarée, les pages ne sont pas encore traduites.
- Captures d'écran sur de vraies données client : jamais sans accord écrit ; les captures actuelles
  utilisent les données d'exemple.
