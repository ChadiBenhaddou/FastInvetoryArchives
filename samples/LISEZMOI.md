# Exports d'exemple

Fichiers ZIP au format exact produit par les téléphones (`Documents/ArchiveInventory/exports/`),
pour essayer l'application ou former les équipes sans toucher aux vraies archives.
Les documents sont **fictifs**.

| Fichier | Appareil | Contenu |
|---|---|---|
| `K_20261022_1800_3boxes_exemple.zip` | K | 3 boîtes, 7 pages en français, en arabe et bilingues, avec les défauts d'une vraie photo : grain, inclinaison, page tournée d'un quart de tour |
| `A_20261022_1536_1boxes.zip` | A | 1 boîte produite par l'application Android elle-même (test automatique, caméra simulée) |
| `selftest.zip` | Y | 1 boîte (n° 9999) utilisée par le script de vérification ; supprimée automatiquement après le test |

Contenu de l'exemple K :

| Boîte | Pages |
|---|---|
| `K-0001-A` | Arrêté n° 2019/145 (nomination de M. Karim Benali) ; قرار رقم 145 (وزارة الداخلية) en photo granuleuse |
| `K-0002-C` | Dossier bilingue n° 77/B (Direction des Archives / مديرية الأرشيف) ; مقرر رقم 2019/77 incliné ; courrier de la Préfecture de Rabat tourné |
| `K-0003-D` | courrier de la Préfecture de Rabat (photo) ; قرار رقم 145 |

## Essayer

1. **Appareils** : enregistrer la lettre **K** (ou **A**).
2. **Import** : glisser le ZIP sur la page, ou le copier dans le dossier surveillé `C:\ArchiveInventory\import`.
3. Suivre l'avancement sur le **Tableau de bord**, puis **Révision** et **Recherche** (essayer « Benali »,
   « الداخلية », « mutation »).

Pour retirer les exemples ensuite : les boîtes K-… restent dans l'inventaire ; il est plus simple de les essayer
sur une installation de test, ou de faire une **sauvegarde** avant et de la **restaurer** après.

Régénérer (développeurs) :
`docker run --rm -v <dossier>:/out archive-inventory/ocr-worker:test python -m tests.make_sample_export /out K`
