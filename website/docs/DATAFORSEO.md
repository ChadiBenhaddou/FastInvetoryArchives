# DataForSEO — recherche de mots-clés pour le Maroc

## Ce qui est appelé

| Besoin | Point d'accès | Remarques |
|---|---|---|
| Idées de mots-clés + volumes | `keywords_data/google_ads/keywords_for_keywords/live` | jusqu'à 20 graines par requête, `location_name: "Morocco"`, `language_code: "fr"` (ou `"ar"` avec `--arabic`) |
| Volumes d'une liste précise | `keywords_data/google_ads/search_volume/live` | import / mise à jour |
| Concurrents (SERP) | `serp/google/organic/live/regular` | top 10 organique : position, domaine, URL, titre |

Les points d'accès « DataForSEO Labs » ne sont pas utilisés : leur couverture du Maroc n'a pas été
vérifiée. Les points Google Ads couvrent le Maroc. Code : `scripts/seo/dataforseo.mjs`.

## Identifiants

`DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` (API, pas le mot de passe du compte web) : uniquement en
secrets de l'environnement GitHub `seo-automation`. Jamais dans le code, le site, le tableau de bord
ou un fichier commité. Le tableau de bord n'appelle jamais DataForSEO : il lit les résultats commités.

## Coût : jamais d'estimation inventée

- Le coût réel est lu dans le champ `cost` de chaque réponse et cumulé dans `research/usage.json`
  (par jour et par mois).
- Avant chaque requête, le client refuse de dépasser `SEO_DAILY_BUDGET_USD` (défaut 1 $) ou
  `SEO_MONTHLY_BUDGET_USD` (défaut 15 $). Pour une requête jamais vue, il compte au pire
  `SEO_UNKNOWN_CALL_MAX_USD` (0,2 $).
- `SEO_MAX_REQUESTS_PER_RUN` (12) plafonne une exécution.
- Cache : `research/cache/` (30 jours, `SEO_CACHE_DAYS`), conservé entre exécutions par
  `actions/cache`. Une même question n'est pas payée deux fois.
- Les tarifs officiels changent : se référer à la page tarifs de DataForSEO et au relevé du compte.

## Essai sans frais (par défaut)

`SEO_LIVE` n'est pas `true` → aucune requête réseau ; des réponses d'exemple (`scripts/seo/fixtures.mjs`)
remplissent `research/keywords.dry.json`, jamais la vraie base. La planification ignore ces données.

```
npm run seo:research -- --estimate            # nombre de requêtes prévues et plafond de coût
npm run seo:research                           # essai à blanc
SEO_LIVE=true npm run seo:research -- --estimate
SEO_LIVE=true npm run seo:research -- --serp 5           # vraie recherche (français)
SEO_LIVE=true npm run seo:research -- --serp 5 --arabic  # + arabe
```

Sur GitHub : Actions → `website-research` → Run workflow (cases « arabe » et « estimation seulement »).
Exécution automatique chaque lundi.

## Premier essai recommandé

1. Approvisionner le compte DataForSEO.
2. Lancer `website-research` avec « estimation seulement », lire le plafond affiché.
3. Lancer en vrai (français), puis une fois avec l'arabe pour vérifier la qualité des données arabes
   au Maroc avant d'en faire une habitude.
4. Ouvrir le tableau de bord → onglet Mots-clés : volumes, intention, groupe, offre, concurrents.

## Base de mots-clés

`research/keywords.json` (commité) : une entrée par mot-clé normalisé (accents français, variantes
arabes), avec métriques et **provenance** (source, date, marché), SERP, classement (intention, groupe,
offre A/B, sujet juridique), statut (`nouveau` → `planifie` → `redige` → `publie` / `ecarte`). Une
nouvelle mesure vide n'écrase jamais une ancienne. Au-delà de `SEO_STALE_DAYS` (90 j) une donnée est
signalée « ancienne ».

Import manuel (export d’OpenSEO ou d’un autre outil) : `npm run seo:import -- fichier.csv [--language fr] [--source openseo]`
(colonnes reconnues : `keyword`, `volume` ou `search_volume`, `difficulty` ou `keyword_difficulty`, `cpc`, `intent`). Voir [OPENSEO.md](OPENSEO.md).
