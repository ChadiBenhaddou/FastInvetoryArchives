# Inventaire rapide des archives — guide complet

Application **100 % hors ligne** pour inventorier des archives en arabe et en français :
des téléphones Android photographient les dossiers de chaque boîte, un PC sans Internet lit les photos (OCR),
en extrait les informations utiles avec une IA locale et permet de réviser, chercher et exporter l'inventaire.

> **Aucune donnée ne quitte le PC.** Ni le PC ni les téléphones n'ont besoin d'Internet, à aucun moment :
> pas de compte, pas de nuage, pas de mise à jour automatique, pas de statistiques envoyées.
> Les photos passent du téléphone au PC **par câble USB**.

Sommaire

1. [Comment ça marche](#1-comment-ça-marche)
2. [Matériel nécessaire](#2-matériel-nécessaire)
3. [Contenu de la clé USB](#3-contenu-de-la-clé-usb)
4. [Installer le PC (Windows)](#4-installer-le-pc-windows)
5. [Installer le PC (Ubuntu)](#5-installer-le-pc-ubuntu)
6. [Vérifier l'installation, réseau coupé](#6-vérifier-linstallation-réseau-coupé)
7. [Préparer les téléphones](#7-préparer-les-téléphones)
8. [Le travail au quotidien](#8-le-travail-au-quotidien)
9. [Comptes et rôles](#9-comptes-et-rôles)
10. [Sauvegarde et restauration](#10-sauvegarde-et-restauration)
11. [Mise à jour](#11-mise-à-jour)
12. [Dépannage](#12-dépannage)
13. [Réglages avancés](#13-réglages-avancés)
14. [Licences](#14-licences)

---

## 1. Comment ça marche

```
  SUR LE TERRAIN (téléphones)                         AU BUREAU (PC hors ligne)
  ───────────────────────────                         ─────────────────────────
  1. « Nouvelle boîte » : le téléphone donne un code   5. Import du ZIP (glisser-déposer
     (ex. A-0123-N), l'agent l'écrit sur la boîte         ou dossier surveillé)
  2. Photo du code écrit                               6. Lecture automatique (OCR arabe + français)
  3. Photo de la couverture de chaque dossier          7. Extraction des champs (règles, ou IA locale
     (contrôle de netteté et de lumière immédiat)         en option) : type, date, référence, titre…
  4. « Exporter » : UN fichier ZIP par session ──câble USB──▶ 8. Révision par une personne
                                                       9. Recherche, inventaire Excel, sauvegarde
```

- Chaque **boîte** reçoit un code unique `LETTRE-NUMÉRO-CONTRÔLE`, par exemple `A-0123-N` :
  la lettre identifie le téléphone, le numéro est donné par le téléphone, la dernière lettre est une
  **lettre de contrôle** qui détecte les erreurs de recopie (un chiffre faux, deux chiffres inversés,
  une mauvaise lettre d'appareil). Les lettres O, I, S, B et Z ne sont jamais utilisées (trop proches de 0, 1, 5, 8, 2).
- Le PC compare le code **photographié** sur la boîte au code **enregistré** : la personne qui révise voit
  les deux côte à côte.
- Un document est **cherchable et prêt à réviser moins d'une seconde après sa lecture** : ses champs (type, date,
  référence, titre…) sont trouvés par des règles. L'IA, plus lente, peut être activée en option ([§ 13](#13-réglages-avancés)).

## 2. Matériel nécessaire

| | Minimum | Conseillé |
|---|---|---|
| **PC** | 16 Go de mémoire, processeur 4 cœurs / 8 threads (Intel Core i5 de 10e génération ou plus récent) | 32 Go, 8 cœurs, ou une carte graphique NVIDIA (8 Go) pour une IA 5 à 10 fois plus rapide |
| Disque | SSD, 40 Go libres pour l'application + **~0,4 Mo par photo** (100 000 photos ≈ 40 Go) | SSD de 500 Go |
| Système | Windows 10/11 64 bits (Pro, Entreprise ou Famille) avec virtualisation activée dans le BIOS, **ou** Ubuntu 22.04 / 24.04 | |
| **Téléphones** | Android 7 ou plus récent, appareil photo avec mise au point automatique, 8 Go libres | Android 10+, 64 Go |
| Câbles | un câble USB de données par téléphone (pas seulement de charge) | |
| Sauvegarde | un disque dur USB externe (exFAT ou NTFS) | deux, gardés à deux endroits différents |

Le PC est prévu pour ne faire que ce travail. Ordres de grandeur mesurés sur un portable Core i5-11300H
(4 cœurs, 16 Go) — les mesurer sur le PC réel (voir [§ 13](#13-réglages-avancés)) :

| Étape | Vitesse | Par jour (24 h) |
|---|---|---|
| Import (vérification + copie) | quelques secondes par boîte | — |
| Lecture (OCR Windows, [§ 4.4](#44-ocr-windows-fortement-conseillé)) + champs par règles + indexation | **~0,8 s par photo**, de l'import à « À réviser » (3 photos en parallèle, PC sans autre travail) | ~100 000 photos |
| Même chose avec PaddleOCR (OCR Windows absent, ou Ubuntu) | ~6 à 15 s par photo (2 en parallèle) | ~10 000 photos |
| Extraction par l'IA, si elle est activée (`LLM_ENABLED=true`, [§ 13](#13-réglages-avancés)) | ~1 à 2,5 min par document | ~700 à 1 300 documents |

Par défaut l'IA est **désactivée** : le type de document, la date, la référence, le titre, les organismes et
les personnes sont trouvés par des règles (français et arabe) en quelques millisecondes, et chaque boîte passe
« À réviser » dès que ses photos sont lues. Les valeurs sont toujours prises dans le texte lui-même ; ce qui
n'est pas trouvé reste vide pour la personne qui révise. La vitesse dépend du PC : des programmes ouverts
(navigateurs, éditeurs…) la divisent facilement par deux.

## 3. Contenu de la clé USB

Copier le dossier `ArchiveInventory-<version>` sur une clé ou un disque **exFAT ou NTFS** (certains fichiers
dépassent 4 Go : FAT32 ne convient pas).

| | |
|---|---|
| `install.ps1` / `install.sh` | installation **et** mise à jour (Windows / Ubuntu) |
| `LISEZMOI.md` | ce guide |
| `prerequis\` | installeurs de WSL, de Docker Desktop et de Python 3.12 pour Windows (si fournis) |
| `android\` | l'application des téléphones (`archive-capture-<version>.apk`) et son guide d'installation |
| `images\`, `models\`, `app\` | logiciels, modèles d'IA et scripts (ne pas modifier) ; `app\windows-ocr\` : l'OCR Windows ([§ 4.4](#44-ocr-windows-fortement-conseillé)) |
| `SHA256SUMS` | empreintes : l'installeur vérifie que rien n'a été abîmé pendant la copie |

## 4. Installer le PC (Windows)

Deux façons, au choix :

- **avec Docker** (§ 4.1 à 4.4) : Docker Desktop, WSL et la virtualisation dans le BIOS ;
- **sans Docker, mode portable** ([§ 4.5](#45-sans-docker--mode-portable)) : seul **Python** est installé, tout le
  reste est un dossier à copier, démarré par **un seul double-clic**. Plus simple, et sans la licence de Docker
  Desktop ([§ 14](#14-licences)).

Compter environ une heure, dont la plupart en attente. Toutes les étapes se font **sans Internet**.

### 4.1 Pré-requis (une seule fois)

1. **Virtualisation** : dans le BIOS/UEFI du PC, activer *Intel VT-x* (ou *AMD-V / SVM*). Vérifier dans le
   Gestionnaire des tâches → Performance → Processeur : « Virtualisation : Activé ».
2. **Fonctions Windows** : ouvrir PowerShell **en administrateur** et lancer :
   ```powershell
   dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
   dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
   ```
   puis **redémarrer**.
3. **WSL** : installer `prerequis\wsl.<version>.x64.msi` (double-clic), redémarrer.
4. **Docker Desktop** : installer `prerequis\Docker Desktop Installer.exe` en laissant cochée l'option
   *Use WSL 2 instead of Hyper-V*. Redémarrer, lancer Docker Desktop, refuser la connexion à un compte
   (*Continue without signing in* / *Skip*), attendre **« Engine running »** en bas à gauche.
5. Dans Docker Desktop → **Settings** (roue dentée) :
   - *General* : cocher **Start Docker Desktop when you sign in to your computer** (indispensable : l'application
     redémarre seule avec Docker) ; décocher *Send usage statistics*.
   - *Software updates* : décocher *Automatically check for updates*.
   - *Apply & restart*.

> **Mémoire.** Par défaut Docker utilise la moitié de la mémoire du PC (8 Go sur 16 Go), ce qui suffit.
> Sur un PC de 32 Go, on peut lui en donner plus : créer le fichier `C:\Users\<utilisateur>\.wslconfig`
> contenant `[wsl2]` puis `memory=20GB` sur la ligne suivante, et redémarrer le PC.

> **Licence Docker Desktop** : voir [§ 14](#14-licences) — gratuit pour les petites structures uniquement.

### 4.2 Installation

1. Ouvrir le dossier de la clé USB, clic droit sur **`install.ps1`** → **Exécuter avec PowerShell**.
   (Si Windows bloque le script : ouvrir PowerShell et taper
   `powershell -ExecutionPolicy Bypass -File E:\ArchiveInventory-1.0.0\install.ps1`, en remplaçant `E:` par la
   lettre de la clé.)
2. L'installeur, dans l'ordre :
   1. vérifie le PC (Docker démarré, mémoire, espace disque) ;
   2. contrôle chaque fichier de la clé (SHA-256) ;
   3. copie l'application dans `C:\ArchiveInventory\app` et crée les mots de passe internes (aléatoires) ;
   4. charge les logiciels et les modèles d'IA (10 à 20 minutes) ;
   5. démarre tout et attend que chaque service soit prêt ;
   6. demande le **mot de passe du compte `admin`** (8 caractères minimum — le noter en lieu sûr) ;
   7. crée les raccourcis sur le bureau ;
   8. lance la vérification complète ([§ 6](#6-vérifier-linstallation-réseau-coupé)).
3. Ouvrir le raccourci **Inventaire des archives** (ou http://localhost dans le navigateur) et se connecter
   avec `admin`.

Options : `-InstallDir D:\Archives` (autre dossier), `-HttpPort 8080` (si le port 80 est déjà pris).

Raccourcis créés sur le bureau :

| Raccourci | |
|---|---|
| **Inventaire des archives** | ouvre l'application dans le navigateur |
| **Sauvegarde vers USB** | sauvegarde complète vers un disque externe ([§ 10](#10-sauvegarde-et-restauration)) |
| **Inventaire - Démarrer** / **Arrêter** | normalement inutiles : l'application démarre avec Docker Desktop |
| **Inventaire - Vérifier** | refait la vérification complète |

### 4.3 Les dossiers sur le PC

| Dossier (`C:\ArchiveInventory\…`) | Contenu |
|---|---|
| `import\` | **dossier surveillé** : tout ZIP copié ici est importé automatiquement |
| `imported\` | ZIP importés (conservés) |
| `failed\` | ZIP refusés, avec un fichier `.erreur.txt` qui explique quoi faire |
| `storage\` | les photos, rangées par boîte |
| `backups\` | sauvegardes de la base (une par nuit, les 7 dernières sont gardées) |
| `app\` | l'application (ne pas modifier, sauf `app\.env` sur instruction) |

### 4.4 OCR Windows (fortement conseillé)

L'application sait utiliser le moteur de lecture de l'**Outil Capture d'écran** de Windows 11 (« Actions de
texte »). Sur des photos de documents en arabe il lit **bien mieux** que le moteur intégré (PaddleOCR), et
**15 fois plus vite** (~1 s par photo au lieu de ~15 s). Il tourne sur le PC lui-même, hors ligne. Tant qu'il
n'est pas installé — ou s'il s'arrête — l'application continue toute seule avec PaddleOCR.

> **Licence — à lire avant d'installer : [§ 14](#14-licences).** Ce moteur n'est pas un composant libre.

**Ce qu'il faut** (aucun téléchargement sur le PC) :

| Élément | D'où il vient |
|---|---|
| `oneocr.dll`, `oneocr.onemodel`, `onnxruntime.dll` | de l'**Outil Capture d'écran du PC** (copiés par le script ; jamais fournis sur la clé). Il faut une version récente, avec les « Actions de texte » : la mettre à jour depuis le Microsoft Store **avant** de couper le réseau du PC. |
| Python 3.12 64 bits | `prerequis\python-3.12.10-amd64.exe` |
| `oneocr-1.0.12-py3-none-any.whl`, `pillow-13.0.0-cp312-cp312-win_amd64.whl` | `app\windows-ocr\wheels\` (rien d'autre : le service n'utilise que Python) |
| Scripts | `app\windows-ocr\` : `setup.ps1`, `ocr_service.py`, `ocr_result.py`, `compare.py`, `requirements.txt` |

**Installation** (après le § 4.2, avec le compte qui utilise le PC) :

1. Installer `prerequis\python-3.12.10-amd64.exe` en cochant **Add python.exe to PATH**.
2. Ouvrir PowerShell et lancer
   `powershell -ExecutionPolicy Bypass -File C:\ArchiveInventory\app\windows-ocr\setup.ps1`.
   Le script copie les 3 fichiers dans `windows-ocr\ocr_data\`, installe les paquets depuis `wheels\`, vérifie que
   le moteur lit un texte de test, crée la tâche planifiée **ArchiveInventory-OCR** (démarrage à l'ouverture de
   session, sur 127.0.0.1 seulement) et vérifie que l'application l'atteint. Si l'accès aux fichiers de l'Outil
   Capture d'écran est refusé : relancer PowerShell **en administrateur**.
3. Relire avec ce moteur les photos déjà traitées (dans `C:\ArchiveInventory\app`) :
   `docker compose exec app php artisan archive:reprocess --upgrade --wait`
   (seules les photos pas encore lues par l'OCR Windows sont reprises, avec une barre de progression).

**Comparer avant de décider** — ancien et nouveau moteur côte à côte sur un dossier de photos, plus un rapport
HTML (l'arabe s'y affiche de droite à gauche) :
`C:\ArchiveInventory\app\windows-ocr\venv\Scripts\python.exe -X utf8 C:\ArchiveInventory\app\windows-ocr\compare.py C:\ArchiveInventory\storage\A-0123-N --html comparaison.html`

**Au quotidien** : rien à faire. Le moteur utilisé est inscrit pour chaque page (`windows-oneocr` ou `paddle`) ;
les pages lues avec une confiance faible restent signalées « à réviser ». Journal du service :
`app\windows-ocr\logs\ocr-service.log`. Pour revenir à PaddleOCR : `OCR_ENGINE=paddle` dans `app\.env`, puis
**Inventaire - Arrêter** / **Démarrer** ; pour retirer le service : `setup.ps1 -Uninstall`.

### 4.5 Sans Docker : mode portable

La même application, sans Docker ni WSL ni réglage du BIOS : les programmes (PHP, nginx, Meilisearch, les deux
OCR) sont **déjà dans le dossier**, rien n'est installé sauf Python. La base de données est un fichier SQLite.
Les données sont rangées comme avec Docker (`import\`, `storage\`, `backups\`… voir § 4.3).

**Installation (une seule fois)** — clé USB `ArchiveInventory-<version>-portable` :

1. Copier **tout le dossier** sur le PC, par exemple vers `C:\ArchiveInventory` (chemin **sans espace ni accent**).
2. Installer `prerequis\python-3.12.10-amd64.exe` en cochant **Add python.exe to PATH**.
3. Pour l'OCR Windows (§ 4.4) : mettre à jour l'Outil Capture d'écran depuis le Microsoft Store **avant** de couper
   le réseau. Rien d'autre à faire : ses fichiers sont copiés automatiquement au premier démarrage.

**Démarrer : double-clic sur `Demarrer.bat`.** C'est la seule commande : elle vérifie le PC, crée au premier
lancement les paramètres, la base et le compte **admin** (le mot de passe est demandé dans la fenêtre), démarre
tout, puis ouvre http://localhost dans le navigateur. **Laisser la fenêtre ouverte** (on peut la réduire) : la
fermer arrête l'application. Un programme qui s'arrête est redémarré tout seul.

| Fichier | |
|---|---|
| `Demarrer.bat` | démarre tout (et ouvre le navigateur si c'est déjà démarré) |
| `Arreter.bat` | arrête tout proprement (les photos en cours de lecture sont terminées d'abord) |
| `Sauvegarder.bat` | sauvegarde vers un disque USB (§ 10) |
| `Restaurer.bat E:\ArchiveInventory-Sauvegarde` | restauration, application arrêtée (§ 10) |
| `Verifier.bat` | vérification complète avec un export d'exemple (§ 6), application démarrée |
| `parametres.env` | réglages (port, nombre de lectures en parallèle…), créé au premier démarrage |
| `systeme\` | base de données, index de recherche, journaux (`systeme\journaux\`) — ne pas modifier |

Pour démarrer avec la session Windows : clic droit sur `Demarrer.bat` → *Créer un raccourci*, puis déplacer le
raccourci dans le dossier qui s'ouvre avec **Win+R** → `shell:startup`.

**Différences avec Docker** : pas d'isolement réseau des programmes (ils n'écoutent que sur le PC lui-même,
127.0.0.1, jamais sur le réseau local) ; pas de Tesseract (troisième OCR de secours) ; l'IA locale (§ 13) n'est pas
disponible. Si le port 80 est déjà pris (par exemple par l'application Docker), mettre `HTTP_PORT=8080` dans `parametres.env`.

**Mise à jour** : `Arreter.bat`, remplacer les dossiers `app\` et `runtime\` et les fichiers `.bat` par ceux de la
nouvelle clé (ne pas toucher aux autres dossiers ni à `parametres.env`), puis `Demarrer.bat` (la base est mise à
jour automatiquement). Faire une sauvegarde USB avant.

## 5. Installer le PC (Ubuntu)

1. Installer Docker Engine **hors ligne**. La clé contient, pour **Ubuntu 24.04**, les paquets Docker
   (`prerequis/ubuntu/`) et leurs dépendances (`prerequis/ubuntu/dependances/` : iptables, nftables…) :
   ```bash
   sudo dpkg -i prerequis/ubuntu/dependances/*.deb prerequis/ubuntu/*.deb
   sudo systemctl enable --now docker
   ```
   Pour une autre version d'Ubuntu, la clé doit être préparée pour elle (voir docs/DEVELOPPEMENT.md,
   option `--with-ubuntu=<nom de code>`).
2. Lancer l'installation (les fichiers d'une clé exFAT ne sont pas exécutables : passer par `bash`) :
   ```bash
   sudo bash install.sh                 # options : --dir /srv/archive --port 8080
   ```
   Mêmes étapes que sous Windows. Les données sont dans `/srv/archive`, l'application dans `/srv/archive/app`.
3. Scripts d'exploitation : `sudo bash /srv/archive/app/scripts/<backup|restore|start|stop|verify>.sh`.

## 6. Vérifier l'installation, réseau coupé

La vérification prouve que tout fonctionne **sans réseau** : elle importe un export d'exemple (une page en
français, une page en arabe), attend la lecture OCR et l'extraction des champs (et affiche le temps par photo), cherche « Benali » et « الداخلية »,
puis **supprime toutes les données de test**. Elle contrôle aussi qu'aucun service ne peut joindre Internet.

1. **Débrancher le câble réseau et couper le Wi-Fi** du PC (ou lancer le script avec `-DisableNetwork` depuis un
   PowerShell administrateur : les cartes réseau sont désactivées pendant le test puis réactivées).
2. Double-cliquer sur **Inventaire - Vérifier** (Ubuntu : `sudo bash /srv/archive/app/scripts/verify.sh`).
3. Attendre « **VÉRIFICATION RÉUSSIE** » (5 à 15 minutes : l'IA charge son modèle au premier passage).
   Le rapport est enregistré dans `C:\ArchiveInventory\verification-<date>.txt`.

En cas d'échec, le rapport indique l'étape en cause (voir [§ 12](#12-dépannage)).

## 7. Préparer les téléphones

Pour chaque téléphone :

1. **Sur le PC** (administrateur) → **Appareils** → choisir une **lettre** libre et un nom
   (« Téléphone salle 2 »…) → **Enregistrer**. Une lettre = un téléphone, pour toujours.
2. Dans la ligne de l'appareil → **Code PIN du téléphone** → **Générer** puis **Afficher** : c'est le code
   administrateur du téléphone (6 à 8 chiffres). Il protège les réglages du téléphone ; on peut le réafficher plus tard.
3. **Installer l'application** sur le téléphone par câble : voir `android\INSTALL-TELEPHONE.md` sur la clé
   (copier l'APK dans *Téléchargements*, l'ouvrir avec l'application *Fichiers*, autoriser l'installation).
4. **Premier lancement** : langue (français / arabe), nom de l'agent, **la lettre de l'étape 1**, numéro de la
   prochaine boîte (**laisser 1** pour un téléphone neuf), le code PIN de l'étape 2 (deux fois).
5. Autoriser l'appareil photo à la première prise de vue.

Le téléphone peut rester en **mode avion** en permanence : l'application n'utilise ni le réseau, ni la localisation,
ni aucun compte.

> **Téléphone réinstallé ou remplacé** : soit lui donner une nouvelle lettre, soit reprendre la même lettre en
> saisissant comme « prochaine boîte » le numéro qui suit le **Dernier n° reçu / émis** affiché dans
> *Appareils* — sinon des codes déjà utilisés seraient redonnés (le PC les signalerait comme conflits).

## 8. Le travail au quotidien

### 8.1 Sur le terrain : photographier une boîte

1. **Nouvelle boîte** → choisir l'emplacement (salle, étagère, rangée — facultatif) → **Générer le code**.
2. **Écrire le code au marqueur, en grandes lettres, sur DEUX côtés de la boîte.**
3. **C'est écrit — photographier le code** : photographier le code écrit (le PC le comparera au code enregistré).
4. Photographier la **couverture ou la première page de chaque dossier**, à plat, à 30-40 cm, sans ombre.
   - Chaque photo est contrôlée tout de suite. « **Photo floue** » ou « **Photo trop sombre** » : **Reprendre**
     (tenir le téléphone immobile, allumer la **Lampe**). « Garder quand même » n'est à utiliser que si le
     document lui-même est flou ou abîmé.
   - Les pages sont recadrées et redressées automatiquement.
5. **Terminer** puis **Fermer la boîte**. Une boîte fermée peut être rouverte tant qu'elle n'est pas exportée.

Une seule boîte est ouverte à la fois. Pour abandonner une boîte (code mal écrit…) : **Annuler cette boîte**, puis
**barrer le code** écrit sur le carton ; le PC sera informé que ce numéro est annulé.

### 8.2 Fin de session : exporter et transférer

1. Sur le téléphone : **Exporter** → **Créer le fichier d'export**. Un seul fichier ZIP contient toutes les boîtes
   fermées et pas encore exportées (`A_20261022_1536_12boxes.zip`).
2. Brancher le téléphone au PC avec le câble USB, choisir **Transfert de fichiers** sur le téléphone.
3. Dans l'explorateur Windows : téléphone → `Documents\ArchiveInventory\exports` → copier le ZIP
   **directement dans `C:\ArchiveInventory\import`** (dossier surveillé : l'import démarre seul quand la copie
   est finie) — ou bien le glisser sur la page **Import** de l'application.
4. Sur le PC, page **Import** : attendre « **Terminé** » et ouvrir **Voir le rapport** (boîtes et photos ajoutées,
   doublons ignorés, conflits, numéros manquants).
5. **Seulement après avoir vu l'import réussi sur le PC** : sur le téléphone, **Historique** → **Confirmer l'import et
   libérer l'espace**. Les photos de cet export sont alors effacées du téléphone.

Tant que l'étape 5 n'est pas faite, le téléphone garde tout : en cas de problème on peut **Ré-exporter**.
Importer deux fois le même fichier est sans danger (« Déjà importé », rien n'est modifié).

### 8.3 Au bureau : révision

Après l'import, chaque boîte passe par **En traitement** puis **À réviser** ; le **Tableau de bord** montre
l'avancement et le temps restant estimé.

Page **Révision** (une boîte après l'autre) :

1. **Vérifier le code** : la photo du code écrit est à côté du code enregistré. S'ils diffèrent, un administrateur
   corrige le code de la boîte (les photos suivent, tout est tracé dans le journal).
2. Pour chaque document : la photo à gauche, le texte lu et les champs extraits à droite (type, date, référence,
   titre, personnes, organismes, mots-clés). Corriger si besoin.
   Les documents à regarder en priorité sont signalés : *Lecture (OCR) peu sûre*, *Manuscrit probable*,
   *Aucun texte détecté*, *Extraction peu sûre*…
3. **Valider et suivant**. Raccourcis clavier : `Ctrl+Entrée` valider et suivant, `Ctrl+S` enregistrer,
   `Alt+←` / `Alt+→` document précédent / suivant.

Quand tous ses documents sont validés, la boîte passe à **Terminée**.

### 8.4 Recherche et inventaire

- **Recherche** : en arabe ou en français, dans le texte des documents et leurs champs ; tolère les fautes de
  frappe, les accents et les variantes d'écriture arabe (ة/ه, أ/إ/ا, ى/ي). Filtres par type de document,
  période (années), salle, agent et boîte. Les mots trouvés sont surlignés ; un clic ouvre la boîte.
- **Boîtes** : liste filtrable ; **Inventaire Excel** (administrateur) télécharge l'inventaire complet
  (feuilles *Boîtes* et *Documents*) ; aussi en CSV.

### 8.5 Conflits

Si un même code arrive avec des photos différentes (téléphone réinstallé, code recopié…), la boîte n'est pas
mélangée : elle est mise de côté dans **Conflits** (administrateur), qui montre les deux versions. Choisir
**Garder l'existant**, **Créer la boîte** sous un autre code, ou **Remplacer**.

## 9. Comptes et rôles

Page **Utilisateurs** (administrateur) : créer un compte par personne.

| Rôle | Peut |
|---|---|
| **Réviseur** | importer, réviser, chercher, consulter |
| **Administrateur** | tout, plus : appareils et codes PIN, utilisateurs, correction de codes de boîte, conflits, export Excel, sauvegardes |

Un compte peut être **désactivé** (jamais supprimé, pour garder le journal). Toutes les modifications sont
enregistrées dans un journal d'audit (qui, quoi, quand).

Mot de passe administrateur oublié : sur le PC, dans PowerShell :
```powershell
cd C:\ArchiveInventory\app
docker compose exec app php artisan archive:create-admin --username=admin
```
(redéfinit le mot de passe du compte `admin`, ou crée un autre administrateur avec `--username=autre`).

## 10. Sauvegarde et restauration

**Automatique** : chaque nuit à 2 h, le PC sauvegarde la base de données et l'index de recherche dans
`C:\ArchiveInventory\backups\` (7 dernières gardées). Page **Sauvegarde** : état, **Sauvegarder maintenant**.
Cela protège contre une erreur de manipulation, **pas contre la panne du disque** : il faut aussi une copie externe.

**Vers un disque USB — au moins une fois par semaine**, et à garder hors du bureau :

1. Brancher le disque USB, double-cliquer sur **Sauvegarde vers USB**, choisir le disque.
2. Le script fait une sauvegarde à jour, puis copie dans `<disque>\ArchiveInventory-Sauvegarde\` :
   la base et l'index (`base\<date>\`), **toutes les photos** (`photos\`, seules les nouvelles sont copiées après
   la première fois) et la clé de l'application (`app-key.txt`).
3. Attendre « Terminé », puis éjecter le disque proprement.

> Le disque de sauvegarde contient **toutes les données**, sans chiffrement : le ranger sous clé.
> Pour un chiffrement, utiliser BitLocker To Go sur le disque (clic droit → Activer BitLocker).

**Restaurer** (après une panne, ou sur un nouveau PC installé avec la clé USB) :

```powershell
powershell -ExecutionPolicy Bypass -File C:\ArchiveInventory\app\scripts\restore.ps1 -From E:\ArchiveInventory-Sauvegarde
```

La dernière sauvegarde est prise (ou `-Backup 2026-10-22_020000` pour en choisir une). Taper `RESTAURER` pour
confirmer : **la base actuelle est d'abord sauvegardée** dans `C:\ArchiveInventory\backups\`, puis remplacée ;
les photos sont recopiées, la clé reprise, l'index reconstruit.

Revenir en arrière (mauvaise sauvegarde choisie…) ou reprendre une sauvegarde de nuit du PC :
`restore.ps1 -From C:\ArchiveInventory\backups -Backup <date>` (les photos du PC ne sont pas touchées).
Ubuntu : `sudo bash /srv/archive/app/scripts/restore.sh /media/<disque>/ArchiveInventory-Sauvegarde`.

**Mode portable** (§ 4.5) : `Sauvegarder.bat` fait la même sauvegarde (la base y est `database.sqlite.gz`) ;
pour restaurer, `Arreter.bat` puis `Restaurer.bat E:\ArchiveInventory-Sauvegarde` (option `-Backup <date>`).
La base actuelle est d'abord copiée dans `backups\avant-restauration-<date>\`. Les sauvegardes du mode Docker
(MySQL) et du mode portable (SQLite) ne sont pas interchangeables.

## 11. Mise à jour

Une nouvelle version arrive sur une nouvelle clé USB. Lancer son **`install.ps1`** (ou `update.ps1`) comme pour
l'installation : une installation existante est détectée, **une sauvegarde est faite d'abord**, les données,
mots de passe et comptes sont conservés, puis la vérification est relancée.

Téléphones : installer le nouvel APK par-dessus l'ancien (voir `android\INSTALL-TELEPHONE.md`) ; les boîtes et le
compteur sont conservés.

## 12. Dépannage

| Problème | Que faire |
|---|---|
| Le navigateur affiche « **L'application démarre…** » | Attendre : la page se recharge seule (1 à 3 minutes après le démarrage du PC). |
| La page ne s'ouvre pas du tout | Docker Desktop n'est pas démarré : l'ouvrir (menu Démarrer), attendre « Engine running ». Il démarre seul à l'ouverture de session si l'option du [§ 4.1](#41-pré-requis-une-seule-fois) est cochée. Puis **Inventaire - Démarrer**. |
| Un ZIP est allé dans `failed\` | Lire le fichier `.erreur.txt` à côté : il dit quoi faire. Ensuite, recopier le ZIP dans `import\`. |
| « Appareil « X » inconnu » | Enregistrer la lettre dans **Appareils** (§ 7), puis réimporter le ZIP. |
| « ZIP incomplet ou abîmé » | La copie a été interrompue : recopier depuis le téléphone (ou **Ré-exporter** dans son Historique). |
| Une photo est signalée abîmée | Seule sa boîte est touchée ; ré-exporter depuis le téléphone et réimporter. |
| **Numéros non reçus** dans *Appareils* | Des boîtes numérotées par le téléphone ne sont pas encore arrivées : un export oublié sur le téléphone, ou des boîtes annulées. |
| Des boîtes restent **En traitement** longtemps | Normal si l'IA a du retard (voir le temps restant sur le Tableau de bord). Si rien n'avance : **Inventaire - Arrêter** puis **Démarrer**. Pour relancer les documents en échec : `docker compose exec app php artisan archive:reprocess --failed` (dans `C:\ArchiveInventory\app`). |
| Un document récent n'est pas trouvé | La recherche porte sur le texte lu : vérifier que la boîte n'est plus *En traitement*. Reconstruire l'index : `docker compose exec app php artisan archive:search-setup --reindex`. |
| Le téléphone refuse beaucoup de photos (« floue ») | Plus de lumière (**Lampe**), téléphone immobile, 30-40 cm. Si le téléphone est en cause, l'administrateur peut baisser la **Netteté minimale** dans les **Réglages** du téléphone (code PIN). |
| Téléphone plein | Exporter, vérifier l'import sur le PC, puis **Confirmer l'import et libérer l'espace** (§ 8.2). |
| Code PIN du téléphone oublié | PC → **Appareils** → **Afficher**. |
| Le PC est lent | Une seule application doit tourner. L'IA occupe le processeur en continu tant qu'il reste des documents : c'est normal. |
| Disque presque plein | L'espace libre est affiché sur le Tableau de bord. Faire une sauvegarde USB, puis libérer de la place ou agrandir le disque. Ne jamais supprimer de fichiers dans `storage\`. |
| La vérification échoue à « Isolement » | Un service a pu joindre Internet : ne pas utiliser le PC, prévenir la personne qui a installé. |

Journaux techniques : `docker compose logs --tail 200 app` (dans `C:\ArchiveInventory\app`).

## 13. Réglages avancés

Les réglages sont dans `C:\ArchiveInventory\app\.env` (à modifier avec le Bloc-notes, puis double-cliquer sur
**Inventaire - Démarrer** pour les appliquer). **Ne jamais modifier les mots de passe et clés qui s'y trouvent.**

| Réglage | Défaut | |
|---|---|---|
| `HTTP_PORT` | `80` | port de l'application (http://localhost:PORT) |
| `LLM_MODEL` | voir ci-dessous | modèle d'IA utilisé pour l'extraction |
| `PIPELINE_WORKERS` | `2` | tâches de lecture OCR / indexation en parallèle |
| `OCR_PROCESSES` | `2` | processus OCR (~1 Go de mémoire chacun) — 3 ou 4 sur un PC de 32 Go |

### Modèle d'IA

**L'IA est désactivée par défaut** (`LLM_ENABLED=false` dans `.env`) : sur processeur seul elle prend 1 à
2,5 minutes par document, contre moins d'une seconde pour tout le reste. Les champs sont alors trouvés par des
règles. L'activer (`LLM_ENABLED=true`, puis **Inventaire - Arrêter** / **Démarrer**) donne de meilleurs titres,
des mots-clés et un résumé, mais chaque boîte attend alors l'IA avant de passer « À réviser ». Pour réextraire
avec le réglage choisi les documents déjà traités : `docker compose exec app php artisan archive:reprocess --all --extraction --wait`.

Deux modèles sont fournis, tous deux sous licence libre autorisant l'usage professionnel :

| `LLM_MODEL` | Licence | Temps par document* | Par jour (24 h)* | Qualité |
|---|---|---|---|---|
| `qwen3:4b-instruct-2507-q4_K_M` (**défaut**) | Apache 2.0 | ~67 s | ~1 300 | la meilleure : type, date, référence et titre justes sur tous les essais, titres arabes gardés en arabe |
| `phi4-mini:3.8b-q4_K_M` | MIT | ~40 s | ~2 150 | plus rapide ; se trompe plus souvent sur le type de document (ex. « décret » pour un arrêté) |

\* processeur seul, portable Core i5-11300H ; un PC de bureau récent est plus rapide, une carte NVIDIA 5 à 10 fois plus.

Quel que soit le modèle, l'IA est contrainte par un schéma (elle ne peut répondre qu'au format attendu, avec
un type de document pris dans la liste), et **toute valeur absente du texte du document est écartée** —
le modèle ne peut pas « inventer » une date, une référence ou un nom. Les documents incertains sont signalés
pour la révision.

Mesurer la vitesse réelle sur le PC (sur les derniers documents importés, rien n'est modifié) :

```powershell
cd C:\ArchiveInventory\app
docker compose exec app php artisan archive:llm-benchmark --show
```

Changer de modèle : modifier `LLM_MODEL` dans `.env`, **Inventaire - Démarrer**, puis, pour réextraire les documents
déjà traités : `docker compose exec app php artisan archive:reprocess --all --extraction`.

**Carte graphique NVIDIA** (pilote NVIDIA installé ; sous Windows, Docker Desktop la prend en charge via WSL) :

```powershell
cd C:\ArchiveInventory\app
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
```

## 14. Licences

**Docker Desktop (Windows) — à vérifier avant le déploiement.** Docker Desktop n'est gratuit que pour
l'usage personnel, l'enseignement, les projets open source non commerciaux et les **petites entreprises (moins
de 250 salariés ET moins de 10 millions de dollars de chiffre d'affaires annuel)**. Une administration ou un
organisme plus grand doit acheter un abonnement Docker (Pro, Team ou Business) pour chaque PC qui l'utilise.
Consulter les conditions en vigueur sur docker.com avant l'installation. **Alternative gratuite :** installer le PC
sous **Ubuntu** ([§ 5](#5-installer-le-pc-ubuntu)) — Docker Engine y est libre (Apache 2.0) et l'application
fonctionne à l'identique.

**OCR Windows (§ 4.4) — risque de licence accepté par le responsable du projet.** Le moteur de l'Outil Capture
d'écran (`oneocr.dll`, `oneocr.onemodel`) appartient à Microsoft. Il n'est ni documenté ni proposé pour être
utilisé par d'autres programmes ; le paquet `oneocr` (sans licence déclarée) l'utilise en déchiffrant son modèle
avec une clé extraite de la DLL. Cet usage contrevient très probablement aux conditions de licence de l'Outil
Capture d'écran. C'est pourquoi les fichiers ne sont jamais copiés sur la clé : chaque PC les prend dans sa propre
installation de Windows. Faire valider cet usage par le service juridique ou informatique ; à défaut, laisser
`OCR_ENGINE=paddle` (PaddleOCR, Apache 2.0). L'API OCR officielle de Windows (`Windows.Media.Ocr`) a été essayée :
elle ne lit presque rien sur les photos de documents arabes.

Tous les autres composants sont libres et utilisables par une administration, sans redevance :

| Composant | Licence |
|---|---|
| Modèle d'IA Qwen3-4B-Instruct-2507 (Alibaba Cloud) | Apache 2.0 |
| Modèle d'IA Phi-4-mini (Microsoft) | MIT |
| Ollama (exécution des modèles) | MIT |
| PaddleOCR, PaddlePaddle (lecture du texte) | Apache 2.0 |
| Python, Pillow (service OCR Windows) | PSF, MIT-CMU |
| Tesseract OCR | Apache 2.0 |
| OpenCV | Apache 2.0 |
| Meilisearch (recherche, édition communautaire) | MIT |
| MySQL Community Server | GPL v2 |
| Laravel, React, Tailwind CSS, Capacitor | MIT |
| Docker Engine (Ubuntu) | Apache 2.0 |
| Mode portable : PHP, nginx, SQLite | PHP License 3.01, BSD 2 clauses, domaine public |
| Mode portable : environnement Visual C++ (`vcruntime140.dll`, `msvcp140.dll` à côté de PHP) | redistribuable Microsoft, copie à côté du programme autorisée |

---

Pour les développeurs (construction des images, de l'APK et de cette clé USB) : [docs/DEVELOPPEMENT.md](docs/DEVELOPPEMENT.md).
