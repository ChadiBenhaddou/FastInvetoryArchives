# Publication automatique quotidienne

Un article par jour, sans action humaine, **seulement s'il passe une porte qualité automatique**.
Sinon il part en pull request `needs-review` ; s'il n'y a pas de sujet utile, rien n'est publié
(jamais d'article de remplissage).

## Déroulement (`.github/workflows/website-daily-article.yml`)

1. **Heure** : le workflow démarre chaque heure entre 05:07 et 12:07 UTC et ne travaille qu'à
   `PUBLISH_HOUR` (heure du Maroc, `Africa/Casablanca`, défaut 9). Pour une heure hors de 6 h–12 h,
   modifier la ligne `cron`.
2. **Quota** : `MAX_ARTICLES_PER_DAY` (défaut 1), compté dans `research/publications.json`.
3. **Recherche** (si `SEO_RESEARCH_DAILY=true`) : petite recherche DataForSEO dans le budget. Si elle
   échoue (budget atteint, compte vide), on continue avec la base existante.
4. **Choix du sujet** (`scripts/seo/plan.mjs`) : meilleur mot-clé mesuré non encore traité, sinon le
   calendrier éditorial ; écarte ce qui cannibaliserait un article existant.
5. **Rédaction** (`generate-article.mjs`, Claude `claude-opus-5-5`, sortie JSON structurée) avec en
   référence : les fonctionnalités prouvées (`docs/FEATURES-VERIFIED.md`), les sources vérifiées
   (`docs/SOURCES-VERIFIEES.md`), les pages du site et les articles existants.
6. **Porte qualité** (`quality-gate.mjs`) — toutes doivent passer :
   - schéma du frontmatter (titre 20–70, description 70–160, catégorie, mots-clés…), slug unique ;
   - pas de cannibalisation (mot-clé principal et sujet) ;
   - longueur ≥ `SEO_MIN_WORDS` (650), structure de titres H2/H3 correcte ;
   - pas de phrases répétées ni de bourrage de mots-clés ;
   - ≥ 2 liens internes valides et un appel à l'action vers une page de contact ;
   - sources externes : domaines de la liste autorisée, URL qui répondent ; chiffres et textes de loi
     sourcés ;
   - aucune fonctionnalité non prouvée (relecture IA indépendante, second appel séparé avec sa propre
     consigne, qui vérifie aussi le ton et les promesses) ;
   - build de production complet du site avec l'article (`build:pages`).
7. **Une seule nouvelle tentative** avec la liste des défauts. Deux échecs → relecture.
8. **Décision** :
   - porte passée + `AUTO_PUBLISH=true` + sujet non juridique → commit sur `main` → Cloudflare
     Pages déploie ;
   - sujet juridique ou réglementaire (loi 69-99, 09-08, CNDP, durées légales…) → **toujours** pull
     request `needs-review`, même si tout passe ;
   - sinon → pull request `needs-review` (article en brouillon).
9. **Résumé quotidien** : commentaire sur l'issue « Résumé SEO quotidien » (label `seo-daily`) —
   article publié / à relire / aucun, raison, résultats de la porte, coût. Les personnes qui suivent
   l'issue le reçoivent par e-mail.

Séparation des droits : le job qui a les clés API (`write`, environnement `seo-automation`) a un
jeton en lecture seule ; le job qui écrit dans le dépôt (`publish`) ne voit aucune clé API.

## Retirer un article en un clic

Actions → **website-unpublish** → Run workflow → slug (+ raison). L'article repasse en brouillon
(`draft: true`, `updatedDate`), le retrait est journalisé dans `research/publications.json`, la page
disparaît au déploiement suivant. Même action depuis le tableau de bord (bouton « Dépublier »).
Remettre en ligne : `draft: false` dans le fichier, commit.

## Réglages (variables de dépôt GitHub)

| Variable | Défaut | Effet |
|---|---|---|
| `AUTO_PUBLISH` | `true` | `false` : tout passe par pull request |
| `MAX_ARTICLES_PER_DAY` | `1` | |
| `PUBLISH_HOUR` | `9` | heure du Maroc |
| `SEO_RESEARCH_DAILY` | `true` | petite recherche DataForSEO avant le choix du sujet |
| `SEO_AI_MONTHLY_BUDGET_USD` | `20` | au-delà, plus d'article ce mois-ci (jour « aucun ») |
| `SEO_DAILY_BUDGET_USD` / `SEO_MONTHLY_BUDGET_USD` | `1` / `15` | DataForSEO |
| `SEO_WRITER_MODEL` / `SEO_REVIEWER_MODEL` | `claude-opus-5-5` | |
| `SEO_AUTHOR_NAME` | équipe | auteur affiché |

Arrêter complètement : Actions → website-daily-article → « Disable workflow ».

## Coûts — ordres de grandeur, à vérifier sur les relevés

- **IA** : coût réel calculé à partir des jetons de chaque réponse et cumulé dans
  `research/ai-usage.json` (visible dans le tableau de bord). Les tarifs utilisés sont dans
  `scripts/seo/llm.mjs` (modifiables par `SEO_AI_PRICES_JSON`). La partie fixe des consignes
  (fonctionnalités, sources) est mise en cache pour réduire le coût. Plafond dur :
  `SEO_AI_MONTHLY_BUDGET_USD`. Mettre aussi une limite de dépense dans la console Anthropic.
- **DataForSEO** : coût lu dans chaque réponse, plafonds jour/mois, cache 30 jours —
  voir [DATAFORSEO.md](DATAFORSEO.md).
- **GitHub Actions** : 8 démarrages courts par jour (contrôle de l'heure) + 1 exécution complète
  (quelques minutes). Gratuit sur un dépôt public ; sur un dépôt privé, cela consomme une partie du
  quota mensuel gratuit de minutes.
- **Cloudflare Pages / D1 / Turnstile / Access** : offres gratuites suffisantes pour ce volume
  (Access gratuit jusqu'à 50 utilisateurs).

## Refus du modèle

Les appels activent le repli automatique côté serveur (`fallbacks: "default"`, bêta
`server-side-fallback-2026-07-01`) : si le modèle refuse une demande, l'API peut la reprendre avec un
modèle de repli. Si la réponse finale reste un refus, le jour est noté « aucun » avec la raison :
rien n'est publié.
