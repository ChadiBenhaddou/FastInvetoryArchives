# Inventaire rapide des archives (100 % hors ligne)

> Le README complet en français (installation hors ligne, téléphones, flux quotidien,
> sauvegarde, dépannage) est le livrable 8. Ce fichier décrit l'état actuel pour les développeurs.

## Structure

| Dossier | Contenu |
|---|---|
| `backend/` | Laravel 13 (PHP 8.3) + interface d'administration React/Vite/Tailwind (`resources/js`) |
| `docker/` | Image applicative (nginx + php-fpm, file d'attente, planificateur), config MySQL |
| `shared/` | Spécification du code de boîte + vecteurs de test communs PHP / mobile |
| `scripts/` | Génération du `.env` avec secrets aléatoires |
| `mobile/` | Application Android (React + Capacitor) : capture, contrôle qualité, export ZIP. Installation : [mobile/INSTALL-TELEPHONE.md](mobile/INSTALL-TELEPHONE.md) |
| `ocr-worker/` | Service OCR Python (livrable 4) |

## Démarrage (machine de développement)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\init-env.ps1 -ArchiveRoot C:\ArchiveInventory
docker compose up -d --build
docker compose exec app php artisan archive:create-admin --username=admin
```

Puis ouvrir http://localhost.

## Tests

```powershell
docker build -f docker/app/Dockerfile --target test -t archive-inventory/app:test .
docker run --rm archive-inventory/app:test

# Application mobile : test de bout en bout (Chromium headless, caméra simulée).
# Produit un ZIP d'export d'exemple dans .devdata\samples\
powershell -ExecutionPolicy Bypass -File scripts\e2e-mobile.ps1

# Interface PC (pile en marche) : connexion, appareil, import du ZIP d'exemple par glisser-déposer
powershell -ExecutionPolicy Bypass -File scripts\e2e-desktop.ps1 -Password <mot de passe admin>
```

## Import (PC)

- **Glisser-déposer** dans la page *Import* (envoi par morceaux de 8 Mo, reprise automatique en cas de coupure).
- **Dossier surveillé** `<ARCHIVE_HOST_ROOT>\import` : tout ZIP copié est importé dès que sa copie est terminée,
  puis rangé dans `imported\` ou dans `failed\` avec un fichier `.erreur.txt` expliquant quoi faire.
- Chaque boîte est vérifiée séparément (lettre de contrôle, empreinte SHA-256 de chaque photo) : une photo abîmée
  ne bloque que sa boîte. Un export déjà importé est ignoré ; une boîte identique est ignorée ; un même code avec
  d'autres photos est mis de côté comme **conflit** pour un administrateur.
- Format du manifeste : [shared/manifest.schema.json](shared/manifest.schema.json).

## Traitement (OCR)

- Service `ocr-worker` (Python/FastAPI, réseau interne uniquement) : **PaddleOCR PP-OCRv5** (détection +
  reconnaissance arabe et latine), **Tesseract 5** (`ara+fra`, modèles *tessdata_best*) en secours.
  Tous les modèles sont dans l'image : aucun téléchargement à l'exécution.
- Par photo : redressement 90/180/270°, correction de l'inclinaison, normalisation du contraste, débruitage des
  photos granuleuses ; chaque ligne est lue par les deux modèles et l'écriture de la ligne décide.
  Les chiffres occidentaux dans les lignes arabes sont relus mot par mot (le modèle arabe a tendance à les omettre).
- Pipeline Laravel : à l'import d'une boîte, une tâche `RunOcrJob` par photo de document (file `ocr`, workers
  `pipeline`) ; la boîte passe en **« à réviser »** quand toutes ses photos sont traitées. Une photo en échec après
  3 essais est signalée pour révision, sans bloquer sa boîte.
- Révision demandée si : confiance OCR < 0,6, écriture manuscrite probable, page sans texte, OCR en échec.
- Relancer : `docker compose exec app php artisan archive:reprocess --failed` (ou des codes de boîtes, ou `--all`).
- Tests OCR (réseau coupé) :
  `docker build --target test -t archive-inventory/ocr-worker:test ocr-worker` puis
  `docker run --rm --network none archive-inventory/ocr-worker:test`.
- ZIP d'exemple avec de vraies pages FR/AR : `docker run --rm -v ${PWD}/.devdata/samples:/out archive-inventory/ocr-worker:test python -m tests.make_sample_export /out K`.

## APK Android

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
# → mobile\dist\apk\archive-capture-<version>.apk (+ .sha256)
```

Tout se construit dans Docker (Node 22, JDK 21, SDK Android 36). Au premier lancement, la clé de signature
est créée dans `mobile\keystore\` : **la sauvegarder hors de la machine** — sans elle, aucune mise à jour
de l'application ne pourra être installée sur les téléphones existants.
