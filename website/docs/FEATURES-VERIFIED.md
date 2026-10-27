# Fonctionnalités vérifiées — ce que le site a le droit d'affirmer

Le site et les articles ne peuvent présenter **que** les fonctionnalités de cette liste, chacune prouvée par un
fichier du dépôt (état de la branche `website`, issue de `portable-windows-mode`, octobre 2026). La porte qualité
des articles (`scripts/seo/quality-gate.mjs`) fournit ce fichier à la relecture IA : toute affirmation produit absente
d'ici fait échouer l'article.

Avant d'ajouter une ligne : vérifier dans le code, citer le fichier. Si une fonctionnalité est retirée du produit,
retirer la ligne **et** chercher son nom dans `website/src/` et `website/src/content/`.

## Capture sur téléphone (application Android)

| Fonctionnalité | Preuve |
|---|---|
| Application Android (React + Capacitor), interface en français et en arabe | `mobile/src/i18n/fr.ts`, `mobile/src/i18n/ar.ts`, `mobile/capacitor.config.ts` |
| Fonctionne en mode avion : ni réseau, ni compte, ni localisation | `README.md` § 7, `mobile/android/app/src/main/AndroidManifest.xml` |
| Code de boîte unique `LETTRE-NUMÉRO-CONTRÔLE` (ex. `A-0123-N`) généré par le téléphone | `shared/BOX_CODE.md`, `mobile/src/lib/boxCode.ts` |
| La lettre de contrôle détecte : un chiffre faux, deux chiffres voisins inversés, une mauvaise lettre d'appareil, une mauvaise lettre de contrôle (vérifié sur tous les codes possibles) | `shared/BOX_CODE.md`, `shared/box-code-vectors.json`, `mobile/src/lib/boxCode.test.ts` |
| Lettres ambiguës exclues (O, I, S, B, Z) | `shared/BOX_CODE.md` |
| Photo du code écrit sur la boîte, puis photo de la couverture de chaque dossier | `README.md` § 8.1, `mobile/src/screens/CaptureScreen.tsx` |
| Contrôle immédiat de netteté et de luminosité (« photo floue », « photo trop sombre ») ; lampe du téléphone | `mobile/src/lib/imageQuality.ts`, `mobile/src/screens/CaptureScreen.tsx` |
| Recadrage automatique du document (prudent : en cas de doute, la photo reste entière) | `mobile/src/lib/docCrop.ts`, `README.md` § 8.1 |
| Emplacement de la boîte : salle, étagère, rangée (facultatif) | `README.md` § 8.1, `mobile/src/screens/NewBoxScreen.tsx` |
| Annulation d'une boîte (le PC est informé du numéro annulé) | `README.md` § 8.1, `backend/app/Models/VoidedSequence.php` |
| Un seul fichier ZIP d'export par session ; photos effacées du téléphone seulement après confirmation de l'import | `README.md` § 8.2, `mobile/src/lib/exporter.ts`, `mobile/src/screens/HistoryScreen.tsx` |
| Réglages du téléphone protégés par un code PIN administrateur (stocké haché) | `mobile/src/lib/pin.ts`, `backend/app/Http/Controllers/DeviceController.php` |

## Transfert et import sur le PC

| Fonctionnalité | Preuve |
|---|---|
| Transfert par câble USB, sans réseau | `README.md` § 1, § 8.2 |
| Import par glisser-déposer ou par dossier surveillé | `backend/routes/web.php` (`uploads`), `backend/app/Console/Commands/ScanImportFolder.php` |
| Contrôle d'intégrité de chaque photo (SHA-256) et du format de l'export | `backend/app/Services/Import/ExportImporter.php`, `backend/app/Services/Import/ManifestValidator.php`, `shared/manifest.schema.json` |
| Réimporter le même fichier est sans danger (« déjà importé ») ; doublons ignorés | `backend/app/Services/Import/ExportImporter.php`, `backend/tests/Feature/ImportTest.php` |
| Conflits : un même code avec des photos différentes est mis de côté (garder, créer sous un autre code, remplacer) | `backend/app/Services/ConflictResolver.php`, `backend/routes/web.php` (`conflicts`) |
| Numéros de boîtes non reçus signalés par appareil | `backend/app/Services/SequenceGaps.php`, `backend/app/Http/Controllers/DashboardController.php` |
| Rapport d'import (boîtes et photos ajoutées, doublons, conflits, numéros manquants) | `backend/app/Services/Import/ImportReport.php` |

## Lecture et extraction

| Fonctionnalité | Preuve |
|---|---|
| OCR arabe et français, entièrement sur le PC | `ocr-worker/app/engine.py`, `windows-ocr/ocr_service.py` |
| Moteur libre par défaut sur Ubuntu : PaddleOCR (PP-OCRv5, arabe + latin) avec Tesseract (`ara+fra`) en secours | `ocr-worker/app/config.py`, `ocr-worker/app/engine.py` |
| Moteur optionnel sous Windows : celui de l'Outil Capture d'écran — **licence à valider par le client** (README § 14) ; PaddleOCR en secours automatique | `windows-ocr/`, `backend/app/Services/Ocr/FallbackOcrService.php`, `README.md` § 4.4 et § 14 |
| Redressement de l'orientation de la page (0/90/180/270°) | `ocr-worker/app/engine.py` |
| Extraction des champs par règles, en français et en arabe : type de document, date, référence, titre, personnes, organismes | `backend/app/Services/Extraction/RuleExtractor.php`, `backend/tests/Unit/RuleExtractorTest.php` |
| Les valeurs viennent toujours du texte du document ; ce qui n'est pas trouvé reste vide | `README.md` § 2, `backend/app/Services/Extraction/TextMatcher.php` |
| IA locale optionnelle (Ollama ; Qwen3-4B Apache 2.0, Phi-4-mini MIT), désactivée par défaut, **mode Docker seulement** | `docker-compose.yml` (`ollama`), `backend/app/Services/Extraction/LlmExtractor.php`, `README.md` § 13 |
| Documents signalés automatiquement : lecture peu sûre, manuscrit probable, aucun texte, extraction peu sûre | `backend/app/Services/Pipeline.php` (`reviewReasons`), `backend/resources/js/components/common.jsx` |

## Après la lecture : pas d'étape de validation obligatoire

| Fonctionnalité | Preuve |
|---|---|
| Une boîte passe « Terminée » dès que ses photos sont lues : **aucune validation document par document** | `backend/app/Services/Pipeline.php` (`checkBox`), `backend/database/migrations/2026_10_26_000011_finish_boxes_waiting_for_review.php` |
| Correction possible à tout moment depuis la page de la boîte ; chaque correction est tracée (qui, quand, avant/après) et met la recherche à jour | `backend/app/Services/Review.php`, `backend/app/Models/Concerns/Auditable.php`, `backend/tests/Feature/ReviewAndSearchTest.php` |
| Comparaison de la photo du code écrit avec le code enregistré ; correction du code par un administrateur (photos déplacées, tracé) | `backend/resources/js/components/CodeCheck.jsx`, `backend/app/Services/BoxCodeCorrector.php` |

> **Interdit :** parler de « révision humaine obligatoire », de « validation de chaque document » ou d'une page
> « Révision » : elles ont été retirées (commit 84f3e09).

## Recherche et inventaire

| Fonctionnalité | Preuve |
|---|---|
| Recherche plein texte en arabe et en français (Meilisearch), tolérante aux fautes de frappe | `backend/app/Services/Search/SearchIndex.php` |
| Variantes d'écriture arabe : hamza (أ/إ/ا), ة/ه, ى/ي, tatweel, voyelles, chiffres arabes-indiens | `backend/app/Support/ArabicText.php`, `backend/tests/Unit/ArabicTextTest.php` |
| Filtres : type de document, période, salle, agent, boîte ; mots trouvés surlignés | `backend/app/Http/Controllers/SearchController.php`, `backend/resources/js/pages/SearchPage.jsx` |
| Inventaire Excel (feuilles Boîtes et Documents) et CSV | `backend/app/Http/Controllers/ExportController.php` |
| Tableau de bord : avancement, temps restant estimé, photos par agent et par jour, documents signalés, numéros manquants | `backend/resources/js/pages/DashboardPage.jsx`, `backend/app/Services/Pipeline.php` (`status`) |

## Comptes, traçabilité, sauvegarde

| Fonctionnalité | Preuve |
|---|---|
| Rôles Réviseur et Administrateur ; comptes désactivables (jamais supprimés) | `backend/app/Enums/UserRole.php`, `backend/app/Http/Controllers/UserController.php` |
| Journal d'audit des modifications | `backend/app/Models/AuditLog.php`, `backend/app/Models/Concerns/Auditable.php` |
| Sauvegarde automatique chaque nuit sur le PC (7 gardées) et sauvegarde vers disque USB (photos incrémentales) | `backend/routes/console.php`, `backend/app/Services/Backup/BackupService.php`, `portable/launcher.py` (`backup`) |
| Restauration avec copie de sécurité préalable | `bundle/target/scripts/restore.ps1`, `portable/launcher.py` (`restore`) |

## Installation et architecture

| Fonctionnalité | Preuve |
|---|---|
| 100 % hors ligne : aucune donnée ne quitte le PC, pas de compte, pas de nuage, pas de statistiques envoyées | `README.md` (introduction), `docker-compose.yml` (réseau `internal`) |
| Installation depuis une clé USB, sans Internet, avec contrôle SHA-256 de chaque fichier | `bundle/build-bundle.sh`, `bundle/target/install.ps1`, `portable/build.py` (`SHA256SUMS`) |
| **Mode Docker** (Windows 10/11 avec Docker Desktop + WSL, ou Ubuntu 22.04/24.04) : services sur un réseau Docker interne sans route vers l'extérieur ; seule une passerelle nginx publiée sur 127.0.0.1 | `docker-compose.yml`, `docker/app/gateway.conf` |
| Vérification réseau coupé : traitement complet d'un export d'exemple, et contrôle qu'aucun service ne peut joindre Internet (mode Docker) | `bundle/target/scripts/verify.ps1`, `backend/app/Console/Commands/SelfTest.php` |
| **Mode portable Windows sans Docker** : seul Python 3.12 est installé ; démarrage par un double-clic (`Demarrer.bat`) | `portable/launcher.py`, `portable/bat/Demarrer.bat`, `README.md` § 4.5 |
| Mode portable : toutes les données dans un dossier `donnees\` ; passage d'un PC à l'autre par clé USB (`Envoyer-donnees.bat` / `Recevoir-donnees.bat`) | `portable/launcher.py` (`send`, `receive`), `README.md` § 4.6 |
| Mode portable : accès depuis les autres PC d'un réseau local fermé, limité aux adresses listées (`PC_AUTORISES`, pare-feu Windows) | `portable/launcher.py` (`allowed_pcs`, `firewall`), `portable/conf/nginx.conf`, `README.md` § 4.7 |

## Chiffres publiables (toujours avec leurs conditions de mesure)

| Chiffre | Conditions (obligatoires à côté du chiffre) | Source |
|---|---|---|
| ~0,8 s par photo, de l'import à « Terminée » | OCR Windows (optionnel, licence à valider), règles, 3 photos en parallèle, portable Core i5-11300H 16 Go sans autre travail | `README.md` § 2 |
| ~0,5 à 0,8 s par photo | mêmes conditions, vérification portable (3 photos d'exemple) | tests du 25-26/10/2026 (`portable/launcher.py verifier`) |
| ~6 à 15 s par photo | PaddleOCR (moteur libre), même portable | `README.md` § 2 |
| ~0,4 Mo par photo (100 000 photos ≈ 40 Go) | photos des téléphones après recadrage | `README.md` § 2 |
| PC conseillé : 16 Go de mémoire, 4 cœurs / 8 threads minimum | — | `README.md` § 2 |

**Interdit :** un débit présenté sans ses conditions ; « 0,8 s » comme chiffre par défaut sans dire qu'il suppose
l'OCR Windows ; tout nombre de clients, de déploiements, de boîtes traitées « en production », de témoignages ou
de certifications — aucun n'est documenté dans le dépôt.

## Limites à dire honnêtement

- Les documents **manuscrits** sont mal lus : ils sont signalés (« Manuscrit probable »), pas transcrits de façon fiable.
- L'OCR peut se tromper : les pages à confiance faible sont signalées et peuvent être corrigées.
- L'IA locale (mode Docker) prend 1 à 2,5 minutes par document sur processeur seul ; elle est désactivée par défaut.
- **Docker Desktop** est payant pour les organisations de plus de 250 salariés ou 10 M$ de chiffre d'affaires :
  alternatives gratuites = Ubuntu (Docker Engine) ou le mode portable Windows (sans Docker).
- **OCR Windows** : moteur propriétaire de Microsoft, usage non documenté ; licence à valider par le client ;
  à défaut, PaddleOCR (Apache 2.0).
- Synchronisation par clé USB : remplace les données d'un PC par celles de l'autre (pas de fusion) — PC utilisés
  l'un après l'autre.
- Accès réseau local : en `http` non chiffré, réservé à un réseau fermé.

## Offre B — ce que le code prouve que l'équipe sait faire (à présenter comme service sur demande)

| Capacité | Preuve |
|---|---|
| Applications hors ligne / sur site, sans donnée sortante | `docker-compose.yml`, `portable/launcher.py` |
| Applications Android de collecte terrain (caméra, contrôle qualité, stockage hors ligne, export) | `mobile/` |
| OCR et traitement de documents arabe/français, interfaces bilingues RTL/LTR | `ocr-worker/`, `mobile/src/i18n/ar.ts` |
| IA locale (modèle de langue sur le PC) pour extraire des données structurées, sans API externe | `backend/app/Services/Extraction/LlmExtractor.php`, `docker-compose.yml` (`ollama`) |
| Moteur de recherche adapté au texte arabe | `backend/app/Support/ArabicText.php` |
| Back-offices web : rôles, journal d'audit, exports Excel/CSV, sauvegarde et restauration | `backend/` |
| Installateurs et paquets de déploiement hors ligne Windows et Ubuntu | `bundle/`, `portable/build.py` |

Les exemples de projets (plan de classement spécifique, prêts de dossiers, courrier arrivée/départ, GED/ERP…) sont
des **possibilités**, jamais des références réalisées.
