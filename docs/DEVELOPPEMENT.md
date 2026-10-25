# Développement et construction du paquet hors ligne

Ce document s'adresse à la personne qui modifie le code ou prépare une nouvelle clé USB d'installation,
sur une machine **connectée** à Internet. Le guide d'utilisation est le [README](../README.md).

## Structure

| Dossier | Contenu |
|---|---|
| `backend/` | Laravel 13 (PHP 8.3) + interface d'administration React/Vite/Tailwind (`resources/js`) |
| `docker/` | Image applicative (nginx + php-fpm, file d'attente, planificateur, passerelle) |
| `ocr-worker/` | Service OCR Python : PaddleOCR PP-OCRv5 (arabe + latin) et Tesseract 5 (`ara+fra`) |
| `windows-ocr/` | OCR Windows (moteur de l'Outil Capture d'écran via `oneocr`), service natif sur 127.0.0.1:8010, joint par la passerelle ; `OCR_ENGINE=windows` (défaut) avec PaddleOCR en secours. Tests : `py -3.12 -m unittest discover -s tests -t .` dans ce dossier |
| `mobile/` | Application Android (React + Capacitor) : capture, contrôle qualité, export ZIP |
| `shared/` | Code de boîte ([BOX_CODE.md](../shared/BOX_CODE.md)), vecteurs de test communs, schéma du manifeste |
| `scripts/` | `.env`, APK, modèles d'IA, tests de bout en bout |
| `bundle/` | Construction de la clé USB (`build-bundle.sh`) et scripts installés sur le PC (`target/`) |
| `e2e/` | Tests navigateur (Playwright) de l'interface PC |

## Architecture

```
 Téléphones Android ──(câble USB : 1 ZIP par session)──▶ PC hors ligne
                                                         │
  127.0.0.1:80 ─▶ gateway (nginx seul) ─┬─▶ app (Laravel + React)        réseau Docker « internal » :
                                        │   queue      (imports)         aucune route vers l'extérieur
                                        │   pipeline×2 (OCR, index)
                                        │   extractor  (IA)
                                        │   scheduler  (dossier surveillé, sauvegarde 2 h)
                                        ├─▶ mysql 8.4
                                        ├─▶ ocr-worker (PaddleOCR + Tesseract)
                                        ├─▶ ollama     (modèle de langue local)
                                        └─▶ meilisearch
```

- Seule la **passerelle** est sur le réseau `frontend` (pour publier le port, sur 127.0.0.1 seulement) :
  elle n'exécute que nginx, sans code PHP, sans données ni volume. Tous les autres conteneurs sont sur le réseau
  Docker *internal* : même si le PC était branché à Internet par erreur, ils ne pourraient rien envoyer.
- Une seule image applicative ; le rôle est choisi par `CONTAINER_ROLE` (`app`, `queue`, `scheduler`,
  `gateway`) et `QUEUES`.
- **OCR Windows** : `windows-ocr/ocr_service.py` tourne hors Docker (DLL Windows), sur 127.0.0.1:8010. Les
  workers `pipeline` l'appellent via `gateway:8010` (serveur nginx non publié, `POST /ocr` et `GET /health`
  seulement) → `host.docker.internal:8010`. Aucun conteneur de données n'a de route vers le PC. Côté Laravel :
  `OcrService` (`FallbackOcrService` = `WindowsOneOcrEngine` puis `PaddleOcrEngine`) ; service arrêté (connexion
  refusée, 502) → PaddleOCR pendant 1 min ; photo refusée (422) → PaddleOCR pour cette photo seulement.
- Pipeline d'une boîte : `ImportExportJob` → `RunOcrJob` par photo (OCR + champs par `RuleExtractor`, quelques ms)
  → `IndexDocumentJob` → la boîte passe **à réviser** quand toutes ses photos sont indexées (~0,8 s par photo,
  3 workers `pipeline`, file `index` prioritaire sur `ocr`). Avec `LLM_ENABLED=true` : `RunOcrJob` →
  `IndexDocumentJob` (cherchable tout de suite) + `ExtractMetadataJob` (IA, minutes) → réindexation → à réviser.

## Démarrage (machine de développement)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\init-env.ps1 -ArchiveRoot D:\chemin\.devdata
docker compose up -d --build
scripts\pull-llm-models.sh            # depuis Git Bash : modèles d'IA dans le volume ollama
docker compose exec app php artisan archive:create-admin --username=admin
```

Puis ouvrir http://localhost.

## Tests

```powershell
# Backend (88 tests)
docker build -f docker/app/Dockerfile --target test -t archive-inventory/app:test .
docker run --rm archive-inventory/app:test

# OCR, réseau coupé
docker build --target test -t archive-inventory/ocr-worker:test ocr-worker
docker run --rm --network none archive-inventory/ocr-worker:test

# Application mobile de bout en bout (Chromium headless, caméra simulée) → ZIP dans .devdata\samples\
powershell -ExecutionPolicy Bypass -File scripts\e2e-mobile.ps1

# Interface PC (pile en marche) : import par glisser-déposer, puis tous les écrans
powershell -ExecutionPolicy Bypass -File scripts\e2e-desktop.ps1 -Password <mot de passe admin>
powershell -ExecutionPolicy Bypass -File scripts\e2e-desktop.ps1 -Password <...> -Script desktop-screens.mjs

# Chaîne complète sur la pile en marche (import → OCR → IA → recherche, puis nettoyage)
docker cp <bundle>\app\samples\selftest.zip archive-inventory-app-1:/tmp/selftest.zip
docker compose exec --user www-data app php artisan archive:selftest /tmp/selftest.zip --query=Benali --query=الداخلية
```

ZIP d'exemple avec de vraies pages FR/AR (appareil K, 3 boîtes) :
`docker run --rm -v ${PWD}/.devdata/samples:/out archive-inventory/ocr-worker:test python -m tests.make_sample_export /out K`.

## APK Android

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
# → mobile\release\archive-capture-<version>.apk (+ .sha256)
```

Tout se construit dans Docker (Node 22, JDK 21, SDK Android 36). Au premier lancement, la clé de signature
est créée dans `mobile\keystore\` : **la sauvegarder hors de la machine** — sans elle, aucune mise à jour
de l'application ne pourra être installée sur les téléphones existants. La version de l'APK est celle de
`mobile/package.json`.

## Construire la clé USB d'installation

Depuis Git Bash, sur la machine connectée (pile de développement démarrée ou non) :

```bash
# 1. Mettre le numéro de version dans VERSION (et mobile/package.json si l'APK change)
bash bundle/build-bundle.sh                    # tests + images + modèles + APK + exemples
bash bundle/build-bundle.sh --with-installers  # + Docker Desktop et WSL pour Windows (~1 Go)
bash bundle/build-bundle.sh --with-ubuntu=noble    # + paquets Docker Engine (et dépendances) pour Ubuntu 24.04
bash bundle/build-bundle.sh --skip-tests --skip-apk
```

Résultat : `bundle/out/ArchiveInventory-<version>/` (~13 Go) à copier tel quel sur une clé USB (exFAT ou NTFS :
les fichiers dépassent 4 Go, FAT32 ne convient pas).

| Contenu | |
|---|---|
| `install.ps1` / `install.sh` | installation et mise à jour (Windows / Ubuntu) |
| `images/` | images Docker (`docker save`, gzip) |
| `models/ollama-models.tar` | modèles d'IA (contenu du volume `ollama-models`) |
| `android/` | APK + empreinte + guide d'installation sur téléphone |
| `app/` | `docker-compose.yml` sans sections `build:`, scripts d'exploitation, exemples |
| `prerequis/` | installeurs Docker Desktop et WSL (`--with-installers`), paquets Docker pour Ubuntu (`--with-ubuntu=noble`) |
| `SHA256SUMS` | contrôlé par l'installeur avant toute copie |

Tester une installation sur la machine de développement (pile de dev arrêtée pour la mémoire) :

```powershell
docker compose stop
powershell -ExecutionPolicy Bypass -File bundle\out\ArchiveInventory-1.0.0\install.ps1 `
  -InstallDir D:\ArchiveInventoryTest -ProjectName archive-test -HttpPort 8081 -Unattended -AdminPassword 'Test-2026-xyz'
# puis : docker compose -p archive-test down -v ; supprimer D:\ArchiveInventoryTest et les raccourcis du bureau
```

## Paquet portable Windows (sans Docker)

Même application, sans conteneur : `portable/launcher.py` (Python, bibliothèque standard seulement) démarre et
surveille tous les processus, que `docker-compose.yml` fait tourner dans les conteneurs :

| Docker | Mode portable |
|---|---|
| `mysql` | fichier SQLite `donnees\base\archive.sqlite` (WAL, transactions `IMMEDIATE` — appliquées par Laravel seulement avec PHP ≥ 8.4, d'où PHP 8.4 dans ce mode) ; sauvegarde par `VACUUM INTO` (`SqliteDumper`) |
| `meilisearch` | `runtime\meilisearch\meilisearch.exe` sur 127.0.0.1:7771, index dans `donnees\recherche` |
| `app` (nginx + php-fpm), `gateway` | `runtime\nginx` sur 127.0.0.1:`HTTP_PORT` + `PHP_WORKERS` processus `php-cgi` (127.0.0.1:9171…) |
| `queue`, `pipeline`, `scheduler` | `php artisan queue:work` / `schedule:work` (`runtime\php`) |
| `ocr-worker` | `uvicorn` de `ocr-worker/app` sur 127.0.0.1:8771 (sans Tesseract) |
| OCR Windows (tâche planifiée) | `windows-ocr/ocr_service.py` sur 127.0.0.1:8010, lancé par le lanceur |
| `ollama`, `extractor` | absents (`LLM_ENABLED=false`) |

Tous les processus sont dans un *job* Windows avec le lanceur : fermer sa fenêtre les arrête tous. Les réglages
(`parametres.env`) sont passés en variables d'environnement, puis `php artisan optimize` à chaque démarrage.

`donnees\` contient tout ce qu'un autre PC doit recevoir et rien d'autre : base, photos (`ARCHIVE_PHOTOS_PATH`),
index de recherche, `cles.env` (`APP_KEY`, `MEILI_MASTER_KEY`) et `INFO.json` (dernier PC, démarré ou arrêté,
version). À l'arrêt, le WAL est remis dans la base (`wal_checkpoint(TRUNCATE)`) : la base est un seul fichier.
`envoyer` / `recevoir` copient avec robocopy (base et index en miroir, photos sans suppression), `INFO.json` en
dernier. Une installation de la version précédente (base dans `systeme\`, photos dans `storage\`) est déplacée dans
`donnees\` au premier démarrage.

Construction, sur la machine connectée (Windows, Python 3.12 64 bits ; ni Docker ni Node ne sont nécessaires) :

```powershell
py -3.12 portable\build.py                   # ~2,5 Go avec PaddleOCR
py -3.12 portable\build.py --without-paddle  # OCR Windows seulement
```

Résultat : `bundle/out/ArchiveInventory-<version>-portable/`. Les téléchargements (versions et SHA-256 fixés dans
`build.py`) restent dans `bundle/out/cache/`. Les paquets Python sont installés par `pip install --target` dans
`runtime\python` pour Python 3.12 x64 : le PC n'a besoin que de Python 3.12. L'APK est repris du paquet Docker
s'il a été construit.

Essai sur la machine de développement (port 8081 si l'application Docker tourne) :

```powershell
robocopy bundle\out\ArchiveInventory-1.0.0-portable D:\ArchiveInventoryPortable /E
D:\ArchiveInventoryPortable\Demarrer.bat
```

## Commandes utiles

| Commande (`docker compose exec app php artisan …`) | Rôle |
|---|---|
| `archive:create-admin --username=…` | créer un administrateur |
| `archive:reprocess --failed` / `--all` / `--extraction` / codes | relancer OCR et/ou extraction |
| `archive:search-setup --reindex` | reconstruire l'index de recherche |
| `archive:llm-benchmark --model=… --model=… --show` | comparer les modèles d'IA sur ce PC |
| `archive:backup` | sauvegarde immédiate (base + index + liste des photos) |
| `archive:selftest <zip> --query=…` | vérification complète, données de test supprimées ensuite |
