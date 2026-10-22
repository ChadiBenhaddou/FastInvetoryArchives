# Installer l'application sur un téléphone Android (par câble, sans Internet)

Fichier à installer : `archive-capture-<version>.apk` (avec son fichier `.sha256` de contrôle).
Android 7 ou plus récent. Aucun compte Google, aucun Wi-Fi, aucune carte SIM n'est nécessaire.

## Méthode 1 — copie par câble + gestionnaire de fichiers (recommandée)

1. Brancher le téléphone au PC avec le câble USB. Sur le téléphone, choisir **« Transfert de fichiers »** dans la notification USB.
2. Sur le PC, copier l'APK dans le dossier `Download` (Téléchargements) du téléphone.
3. Sur le téléphone, ouvrir l'application **Fichiers** → *Téléchargements* → toucher l'APK.
4. Android demande d'autoriser l'installation depuis cette source : **Paramètres → Autoriser** puis revenir et toucher **Installer**.
5. Si Play Protect affiche un avertissement (application inconnue) : *Plus de détails → Installer quand même*.
6. Après l'installation, retirer l'autorisation « sources inconnues » donnée au gestionnaire de fichiers.

## Méthode 2 — ADB (pour l'administrateur, plusieurs téléphones)

Activer *Options pour les développeurs → Débogage USB* sur le téléphone, puis sur le PC :

```
adb install -r archive-capture-1.0.0.apk
```

`-r` met à jour l'application en conservant ses données (boîtes, photos, compteur).

## Premier lancement (administrateur)

1. Choisir la langue (français / arabe).
2. Saisir le **nom de l'agent**.
3. Choisir la **lettre de l'appareil** attribuée sur le PC (*Appareils*). Une lettre = un téléphone.
4. **Numéro de la prochaine boîte** : laisser `1` pour un téléphone neuf. En cas de réinstallation,
   saisir le numéro qui suit le dernier numéro reçu par le PC pour cette lettre (sinon des codes seraient réutilisés).
5. Saisir deux fois le **code PIN administrateur** (6 à 8 chiffres) généré sur le PC.
6. Autoriser l'accès à la **caméra** à la première prise de vue.

## Mise à jour

Installer le nouvel APK par-dessus l'ancien (méthode 1 ou `adb install -r`). Les données sont conservées.
Une mise à jour n'est acceptée par Android que si l'APK est signé avec **la même clé** :
la clé est dans `mobile/keystore/` sur la machine de développement — **la sauvegarder** (sinon il faudrait
désinstaller l'application, ce qui efface les photos non exportées).

## Vérifier l'APK (facultatif)

Sous Windows : `certutil -hashfile archive-capture-1.0.0.apk SHA256` doit afficher la valeur du fichier `.sha256`.
