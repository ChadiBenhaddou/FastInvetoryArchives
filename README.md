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
```

## APK Android

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
# → mobile\dist\apk\archive-capture-<version>.apk (+ .sha256)
```

Tout se construit dans Docker (Node 22, JDK 21, SDK Android 36). Au premier lancement, la clé de signature
est créée dans `mobile\keystore\` : **la sauvegarder hors de la machine** — sans elle, aucune mise à jour
de l'application ne pourra être installée sur les téléphones existants.
