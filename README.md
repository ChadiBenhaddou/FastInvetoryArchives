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
| `mobile/` | Application Android Capacitor (livrable 2) |
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
```
