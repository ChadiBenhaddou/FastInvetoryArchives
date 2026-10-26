# MASTER PROMPT — SEO Website for « Inventaire rapide des archives » and Custom Application Development (Morocco)

## 0. What already exists — read this first

This repository (`FastInvetoryArchives`, version in `VERSION`) is **not a web SaaS**. It is a working,
**100 % offline, on-premise** archive-inventory system. Verify each point below in the code before relying on it:

| Component | Location | What it does |
|---|---|---|
| Android capture app | `mobile/` (React + Capacitor, FR/AR UI in `src/i18n`) | Generates a unique box code `LETTRE-NUMÉRO-CONTRÔLE` (e.g. `A-0123-N`) with a check letter that catches copying errors; photographs the written code and each folder cover; instant blur/darkness check; auto crop and deskew; exports one ZIP per session. Works in airplane mode. |
| Transfer | USB cable | ZIP copied to a watched folder or dragged onto the Import page. No network, no cloud. |
| PC backend + admin UI | `backend/` (Laravel 13, PHP 8.3, React/Vite/Tailwind in `resources/js`) | Import with SHA-256 checks, duplicate detection, conflicts, missing-sequence detection; dashboard; review page with keyboard shortcuts; roles (Réviseur / Administrateur); audit log; Excel/CSV inventory export; nightly + USB backups and restore. |
| OCR | `ocr-worker/` (PaddleOCR PP-OCRv5 + Tesseract `ara+fra`), `windows-ocr/` (optional Windows engine) | Reads Arabic and French documents; ~0.8 s/photo with the Windows engine, ~6–15 s with PaddleOCR (figures from the README, measured on one specific laptop). |
| Field extraction | `backend/app/Services/Extraction` | Rule-based extraction (type, date, référence, titre, personnes, organismes) in milliseconds; optional local LLM (Ollama, Qwen3-4B / Phi-4-mini). Values are always taken from the text; unknown fields stay empty. |
| Search | Meilisearch | Arabic + French full-text, typo-tolerant, Arabic spelling variants (ة/ه, أ/إ/ا, ى/ي), filters by type, period, room, agent, box. |
| Delivery | `bundle/`, `docker-compose.yml` | Installed from a USB key on Windows 10/11 (Docker Desktop + WSL) or Ubuntu 22.04/24.04; offline self-test that proves no service can reach the Internet. |

**Consequences for the website:**

1. The marketing website is a **new, separate project** (e.g. `website/` at the repo root). It must not touch,
   restructure or depend on `backend/`, `mobile/`, `ocr-worker/`, `windows-ocr/`, `bundle/` or `docker/`.
   The existing build scripts, tests and the offline bundle must keep working unchanged.
2. There is no online application to "log into". Replace any "Accéder à l'application" CTA with
   **« Demander une démonstration »**, **« Demander un devis / un pilote »** and **« Parler de votre projet sur mesure »**.
3. **Data sovereignty is the core selling point**: no data leaves the PC, no account, no cloud, no telemetry.
   The website itself must respect this message — no third-party trackers by default, privacy-friendly analytics only if
   explicitly enabled, and no claim that contradicts the offline architecture.
4. Licensing facts in README §14 are real constraints and must be reflected honestly (Docker Desktop paid for large
   organisations → Ubuntu alternative; the Windows OCR engine is optional and its licence must be validated by the
   customer; the default open-source stack is PaddleOCR/Tesseract). Never market the Windows OCR speed as the default
   without that caveat.

## 1. Mission and business objective

Build a professional, French-language website (with an Arabic version as a later phase, see §4) that attracts qualified
Moroccan organisations through organic Google search and converts them into leads for **two offers**:

**Offer A — The product: « Inventaire rapide des archives »**
Offline inventory of paper archives: phone capture → USB → OCR arabe/français → extraction → révision humaine →
recherche → inventaire Excel. Sold as installation + training + support (pricing model to be confirmed by the owner;
do not invent prices).

**Offer B — Custom applications on demand (« Applications sur mesure »)**
The same team designs and builds applications tailored to each organisation's workflow. Position this offer around the
capabilities that the existing codebase **proves** the team can deliver:

- Offline / air-gapped and on-premise applications (no data leaves the organisation).
- Android field-capture apps (camera, quality control, offline storage, export).
- OCR and document processing for Arabic and French, including bilingual RTL/LTR interfaces.
- Local AI (on-premise language models) for extracting structured data from documents — no external API.
- Search engines adapted to Arabic text.
- Web back-offices with roles, review workflows, audit logs, Excel/CSV exports, backups and restore.
- Installers and offline deployment packages for Windows and Ubuntu.

Examples of custom projects to present as **possibilities, not as completed references**: adapting the inventory to a
specific plan de classement or tableau de gestion; gestion des mouvements et prêts de dossiers; registre courrier
arrivée/départ; numérisation et indexation de dossiers RH, fonciers, juridiques ou médicaux; connexion à un système
existant (GED, ERP); applications de collecte terrain hors ligne; extraction de données de formulaires ou factures.
The site must clearly say these are built on request, after a needs analysis, and must not imply they already exist
as products.

The website has two jobs:
1. Promote both offers and convert visitors into qualified leads.
2. Operate as an SEO publishing platform that researches real search demand, publishes useful French articles and
   builds topical authority on archive management and custom document applications in Morocco.

Do not stop at a mockup. Implement the website, SEO infrastructure, content workflow, keyword-research integration and
deployment configuration, then validate the production build.

## 2. Start by inspecting

1. Re-read `README.md`, `docs/DEVELOPPEMENT.md`, `shared/BOX_CODE.md`, the routes in `backend/routes/web.php`, the
   admin pages in `backend/resources/js/pages`, and the mobile screens in `mobile/src/screens`. Build a **feature
   inventory** (`website/docs/FEATURES-VERIFIED.md`) listing each feature you will market with the file that proves it.
   The website may only claim features in that list.
2. Check `e2e/desktop-screens.mjs` and `mobile/e2e/smoke.mjs`: they already drive the UI and take screenshots. Reuse
   them (with the sample data in `samples/`, never real archives) to produce **real product screenshots** for the site.
   Blur or replace any personal name visible in samples if needed.
3. Investigate the official OpenSEO repository (see §8) and DataForSEO documentation before writing integration code.
4. Write a short implementation plan in `website/docs/PLAN.md`, then start building without waiting for approval.

## 3. Technology and deployment

- **Astro** (static output) in `website/`, Markdown/MDX content collections with schema validation, minimal client JS.
- **Cloudflare Pages** for hosting (build `npm run build` in `website/`, output `website/dist`). Configure the Pages
  project root to `website/` so the rest of the monorepo is ignored.
- **Pages Functions / Workers** only where server-side code is needed (lead form, private dashboard API).
- **GitHub Actions** for scheduled keyword research, brief/draft generation and approved publishing. Path filters so
  website workflows never run the app's CI, and vice versa.
- **DataForSEO** for real keyword and SERP data; **OpenSEO** reused where verified compatible.
- Storage: version-controlled JSON/CSV in `website/research/` for the first phase; Cloudflare D1 (or KV/R2) only if the
  dashboard needs it.
- Secrets in GitHub Actions secrets / Cloudflare environment variables only. Provide `website/.env.example` with
  placeholders. The public site must keep working if research automation, OpenSEO, DataForSEO or the AI provider is down.
- Keep the private research/publishing system fully separated from the public site; drafts and the dashboard are never
  in the public output.

## 4. Pages and information architecture

All copy in French (professional, natural, Moroccan B2B context). Prepare i18n routing for a later **Arabic version**
(`/ar/`, RTL) — the product itself is bilingual, and Arabic searches are a real opportunity — but only publish Arabic
pages once they are properly written and reviewed, with correct `hreflang`.

**Homepage**
- Headline targeting inventaire des archives au Maroc, e.g. « Inventoriez vos archives papier en arabe et en français —
  sans que vos données quittent vos locaux ».
- The workflow in 4 steps (photo → USB → lecture automatique → révision et recherche), using real screenshots.
- Key differentiators: 100 % hors ligne, arabe + français, téléphones Android ordinaires, codes de boîte à contrôle
  d'erreur, révision humaine, inventaire Excel.
- A second block: « Votre besoin est différent ? Nous développons des applications sur mesure » → Offer B.
- Audiences: administrations publiques, collectivités, entreprises, cabinets et prestataires d'archivage.
- Featured guides, FAQ, contact and demo CTAs.
- Trust elements **only if verifiable** (real deployments, real figures with their measurement conditions). No invented
  clients, logos, testimonials, certifications or statistics.

**Product pages** (`/logiciel-inventaire-archives/` and sub-pages if content justifies them)
- Capture terrain (application Android), Import et contrôle (doublons, conflits, numéros manquants), Lecture OCR
  arabe/français, Extraction des champs, Révision, Recherche, Export Excel/CSV, Comptes et journal d'audit,
  Sauvegarde et restauration, Installation hors ligne (Windows / Ubuntu).
- A « Sécurité et confidentialité » page explaining the air-gapped architecture (internal Docker network, gateway on
  127.0.0.1, offline self-test) in plain language.
- A « Configuration requise » page based on README §2 (hardware, phones, disk ~0.4 Mo/photo).
- Honest limitations: handwritten documents are flagged, low-confidence OCR is flagged for review, the optional AI is
  slower, Docker Desktop licensing.

**Applications sur mesure** (`/applications-sur-mesure/`)
- What we build (capability list from §1), how we work (analyse du besoin → maquette → pilote → déploiement →
  formation → maintenance), technologies, data-sovereignty approach, typical deliverables.
- Sub-pages only for genuinely distinct needs (e.g. collecte terrain hors ligne, OCR et extraction de documents arabes,
  outils de gestion documentaire internes). No near-duplicates.
- A dedicated form: « Décrivez votre projet ».

**Solutions pages** — administrations publiques, entreprises privées, cabinets et prestataires d'archivage, services
d'archives et archivistes, organisations qui modernisent leur gestion documentaire. Each page addresses real workflows
(e.g. for a prestataire: several phones in parallel, one letter per device, conflict handling between teams).

**Blog and guides** — `/blog/`, `/blog/[slug]/`, `/guides/`, category and tag pages only when useful, related articles,
breadcrumbs, table of contents, pagination, author, publication and update dates, contextual product and custom-dev CTAs.

**Other pages** — À propos, Contact, Demander une démonstration, Politique de confidentialité (conforme à la loi 09-08
et aux exigences de la CNDP — verify current official requirements), Mentions légales, 404.

## 5. Design

Professional, restrained, institutional; excellent typography for French (and Arabic later); generous whitespace;
accessible contrast and keyboard navigation; semantic HTML; responsive; optimised images; no generic AI look.
Reuse the visual language of the existing admin UI (Tailwind) where it helps consistency between site and product.
Keep the conversion path (démo / devis / projet sur mesure) visible on every page.

## 6. Technical SEO

Unique titles and descriptions; canonical URLs; clean URLs; consistent trailing slashes; real 404; `_redirects`;
`robots.txt`; XML sitemap of canonical indexable pages only; Open Graph; `lang="fr"` (and `hreflang` when Arabic
exists); `noindex` on preview deployments (`*.pages.dev`) and on any non-production host; drafts never built.

Structured data reflecting visible content only: `Organization`, `WebSite`, `BreadcrumbList`, `BlogPosting`, `FAQPage`
where a visible FAQ exists, `Service` for the custom-development offer, `SoftwareApplication` only with supported
properties (operatingSystem, applicationCategory) — no fake ratings or reviews.

Performance: Lighthouse on the production build, responsive images, font subsetting, no layout shift. Document Google
Search Console setup, sitemap submission and verification. Never claim indexing or rankings without data.

## 7. French SEO strategy for Morocco

Seed keywords — hypotheses to verify with real data, not volumes:

*Product / archives:* inventaire des archives au Maroc · logiciel de gestion des archives · logiciel d'inventaire des
archives · traitement des archives au Maroc · gestion des archives administratives · classement des archives · plan de
classement documentaire · tableau de gestion des archives · durée de conservation des documents · récolement des
archives · archivage physique et numérique · numérisation des archives au Maroc · OCR arabe · OCR documents arabes ·
reconnaissance de texte arabe · recherche documentaire arabe · externalisation des archives au Maroc · prestataire de
gestion des archives · logiciel d'archivage hors ligne · archivage sans cloud · réglementation marocaine sur les archives
(loi 69-99, Archives du Maroc — verify official sources).

*Custom development:* développement d'application sur mesure Maroc · développement application mobile Android Maroc ·
application de gestion sur mesure · logiciel sur mesure pour administration · application hors ligne · application de
collecte de données terrain · solution OCR sur mesure · extraction automatique de données de documents · intelligence
artificielle locale pour documents · digitalisation des processus administratifs · transformation numérique
administration Maroc.

Investigate Moroccan cities (Rabat, Casablanca, Tanger, Marrakech, Fès, Agadir, Meknès, Oujda…) only where the business
can genuinely serve; no repetitive city pages.

Topic clusters:
1. Inventaire et récolement des archives.
2. Classement et description documentaire.
3. Gestion des archives administratives.
4. Archivage physique et numérique.
5. Numérisation, OCR et recherche documentaire — with a sub-focus on **documents en arabe**.
6. Conservation, élimination et durées de conservation.
7. Réglementation et bonnes pratiques au Maroc.
8. Externalisation, coûts et organisation des services d'archives.
9. Logiciels et outils de gestion documentaire (including offline / sovereign solutions).
10. Transformation numérique des administrations et entreprises.
11. **Applications sur mesure** : cahier des charges, choix d'un prestataire, applications hors ligne, collecte terrain,
    IA locale et confidentialité des données.

Map every planned article to one intent, one cluster and one conversion target (Offer A or Offer B).

## 8. OpenSEO integration

Before writing code: find the official OpenSEO repository, read its README, source and licence, list its dependencies,
which DataForSEO endpoints it supports, and whether it runs in GitHub Actions, Node, or Cloudflare Workers. Document
findings in `website/docs/OPENSEO.md`. Reuse what fits; run it in GitHub Actions if it cannot run in Cloudflare; never
make the public site depend on it. Do not assume its name, coverage or compatibility.

## 9. DataForSEO integration

Use the relevant endpoints (keyword suggestions, related keywords, search volume, SERP, competitors, difficulty, CPC,
trends if justified) with Morocco location and French language — and test Arabic language for Morocco too. Verify
parameters, supported locations and current pricing in the official docs; do not hardcode a per-request price.
Before any large job: verify pricing, estimate request count and cost, respect the budget, test a small batch first.
Credentials (`DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`) only in server-side secrets — never in client code, public env
vars, HTML, API responses, committed files or source maps.

## 10. Keyword research store

Fields: keyword (original + normalised), country, language, search volume, metric source, retrieval date, intent,
difficulty/competition, CPC, SERP competitors, related keywords, cluster, **target offer (A/B)**, assigned brief,
article URL, status, last updated. Deduplicate, normalise accents/whitespace without losing the original, cache
responses, record provenance, separate API values from AI classifications, keep missing values missing, refresh stale
data selectively.

## 11. Private SEO dashboard

Keyword explorer (filter, sort, source/date, stale data, competitor URLs, CSV export) and content planning (clusters,
uncovered keywords, cannibalisation detection, primary/secondary keywords, briefs, statuses planned → drafted →
approved → published → updated). Protect it with real authentication (e.g. Cloudflare Access), validate requests
server-side, authorise publishing operations, rate-limit, never expose API keys. A secret URL is not authentication.

## 12. Daily article workflow

Target: one useful article per day — skip when no valuable opportunity exists.
Research → compare with existing keywords and articles → pick a topic with real demand and business relevance →
brief → French draft → validate facts, metadata, links, structure → duplicate/cannibalisation check → save as
Markdown with `draft: true` → open a pull request for editorial review → publish only after approval (merge) →
Cloudflare Pages redeploys → record URL, keyword, date.

Frontmatter: `title`, `description`, `slug`, `pubDate`, `updatedDate`, `author`, `category`, `tags`, `primaryKeyword`,
`secondaryKeywords`, `offer` (`inventaire` | `sur-mesure`), `draft`, `sources`, `canonicalURL` when needed. Validated at
build time.

Quality rules: clear intent, practical value, natural French, logical headings, relevant internal links, reliable sources
for factual and regulatory claims (Archives du Maroc, Bulletin officiel, CNDP — verify current texts), facts separated
from recommendations, no legal advice presented as authoritative, no fabricated statistics or quotations, no keyword
stuffing. Product mentions must match `FEATURES-VERIFIED.md`; custom-development mentions must be framed as services
on request. Default is human approval; auto-publication only as an explicit, logged, opt-in setting.

## 13. Editorial calendar — first 12–20 articles

Refine with keyword data; merge topics with the same intent. Candidates:

*Archives (Offer A):*
- Comment réaliser un inventaire des archives administratives ?
- Comment numéroter et étiqueter des boîtes d'archives sans erreur ?
- Comment préparer un récolement des archives ?
- Quelles étapes pour traiter un fonds d'archives ?
- Comment organiser un plan de classement documentaire ?
- Tableau de gestion et durées de conservation : comment les établir au Maroc ?
- Archivage physique ou numérique : quelles différences ?
- Comment retrouver rapidement un dossier archivé ?
- OCR des documents en arabe : possibilités et limites.
- Inventorier des archives sans Internet : pourquoi et comment ?
- Comment estimer le coût et la durée d'un projet d'inventaire ?
- Quels critères pour choisir un logiciel de gestion des archives ?
- Comment préparer un cahier des charges pour un projet d'archivage ?

*Custom development (Offer B):*
- Logiciel sur mesure ou logiciel standard : comment choisir pour une administration ?
- Comment rédiger un cahier des charges pour une application sur mesure ?
- Applications hors ligne : quand sont-elles indispensables ?
- Collecte de données terrain sur téléphone Android : bonnes pratiques.
- IA locale ou IA dans le cloud : protéger les données sensibles de son organisation.

## 14. Internal linking and conversion

Each cluster links to the relevant product or custom-development page and to related guides; product pages link back
to guides; breadcrumbs and related articles everywhere; build-time broken-link and orphan-page checks. CTAs are
contextual: archive-method articles → démo du logiciel; "my need is specific" articles → projet sur mesure.

## 15. Lead generation

Two forms (or one with a "type de demande" switch): **Démonstration du logiciel** and **Projet sur mesure**.
Fields: nom, email professionnel, organisation, téléphone (optional), type d'organisation, ville, type de demande;
for the product — volume approximatif d'archives (boîtes / mètres linéaires), langues des documents; for custom work —
description du besoin, délai souhaité, budget indicatif (optional ranges).
Pages Function with server-side validation, Cloudflare Turnstile, honeypot, rate limiting, delivery to a real
destination (email via a transactional provider and/or D1 storage), success and error states, consent text compliant
with loi 09-08, minimal data collection. A non-functional form is not done.

## 16. Cost control and reliability

Daily and monthly budgets, request counters, cost estimates before each run, request logs, caching, deduplication,
bounded retries with backoff, dry-run mode (default in local development), small-batch tests, hard stop at budget,
graceful provider outages. Never run a large paid batch without an estimate.

## 17. Cloudflare Pages deployment

Git-based deployment from this repo with root directory `website/`; production and preview environments (previews
`noindex`); build command and output; environment variables; custom domain and HTTPS; sitemap, robots, redirects, 404;
troubleshooting. Cloudflare Pages does not run cron jobs: scheduled research runs in GitHub Actions (or a Worker Cron
Trigger if justified). Separate clearly: static build → scheduled research → AI drafting → editorial approval (PR) →
merge and redeploy. Give workflows the minimum permissions (`contents: write` and `pull-requests: write` only on the
drafting job).

## 18. Testing

- Website: production build, routes, unique metadata, canonicals, sitemap content, robots, drafts excluded, 404,
  internal links, mobile layout (Playwright is already available in this repo's environment), Lighthouse/axe.
- Content: frontmatter schema, unique slugs, valid dates, resolvable links, duplicate detection, claims cross-checked
  against `FEATURES-VERIFIED.md`.
- Integrations: secure credential loading, one small real DataForSEO request (manual, not in CI), mocked responses in
  CI, error handling, cache, budget stop, OpenSEO per its documented capabilities, valid draft generation, approval
  required, merge triggers deployment.
- **Regression: the existing app's tests and builds (`backend`, `mobile`, `ocr-worker`, `windows-ocr`, `bundle`) are
  unaffected** — run them or at minimum confirm no file outside `website/`, `.github/workflows/website-*` and root
  docs changed.

## 19. Phases

1. **Foundation** — feature inventory, real screenshots, Astro site, home, product, sur-mesure, solutions, contact,
   legal pages, SEO metadata, Cloudflare Pages config.
2. **Blog and technical SEO** — content collections, article pages, sitemap, robots, structured data, internal links,
   first 5–8 well-sourced articles, working lead form.
3. **Keyword research** — OpenSEO verification, DataForSEO integration, secure config, caching and budget, keyword
   store, private dashboard.
4. **Content automation** — editorial calendar, briefs, French drafts, validation, PR-based approval, scheduled runs.
5. **Optimisation** — monitoring, Search Console, conversion improvements, Arabic version, priorities refined by real data.

A working Phase 1–2 beats an unfinished everything.

## 20. Deliverables

`website/` project; Cloudflare Pages configuration; `FEATURES-VERIFIED.md`; real screenshots; OpenSEO integration or a
documented alternative; DataForSEO integration; private dashboard; keyword data model; scheduled research workflow;
Markdown publishing system; initial articles; SEO and content tests; `website/.env.example`; README; guides for
deployment, DataForSEO, scheduling, cost control; list of remaining external configuration (domain, Cloudflare account,
DataForSEO account, email provider, Turnstile keys, Search Console, AI provider key).

## 21. Definition of done

- The existing offline application, its tests and its USB bundle are unchanged and still work.
- The website is professional, mobile-friendly, builds and deploys to Cloudflare Pages, prerendered and indexable.
- Every product claim is traceable to the code; the custom-development offer is presented honestly as a service.
- Technical SEO checks pass; drafts, dashboard and credentials never reach public output.
- OpenSEO capabilities are verified; DataForSEO returns real data with secure credentials, cached and budget-limited.
- Briefs and valid French drafts are produced; scheduled research runs independently of the site; publication requires
  approval.
- Lead submissions (demo and custom project) reach a real destination.
- Setup and deployment instructions are complete.

Finish with a summary of what was implemented, what was tested, required environment variables, external services to
configure, and what remains unfinished.

**Final instruction:** make practical engineering decisions, keep the website separate from the offline product, verify
external dependencies instead of guessing, never invent customers, figures or features, and validate the actual
production build.
