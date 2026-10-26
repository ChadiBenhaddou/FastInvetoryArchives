---
title: "Inventorier des archives sans Internet : pourquoi et comment"
description: "Pourquoi un inventaire d'archives confidentielles gagne à se faire hors ligne, ce que cela implique en pratique, et comment vérifier que rien ne sort."
slug: inventorier-archives-sans-internet
pubDate: 2026-10-26
author: "Équipe Inventaire rapide des archives"
category: logiciels-outils
tags: ["hors ligne", "confidentialité", "inventaire", "souveraineté des données"]
primaryKeyword: "logiciel d'archivage hors ligne"
secondaryKeywords: ["archivage sans cloud", "inventaire des archives hors ligne", "confidentialité des archives"]
offer: inventaire
sources:
  - title: "CNDP — Commission nationale de contrôle de la protection des données à caractère personnel"
    url: "https://www.cndp.ma/"
---

La plupart des logiciels récents supposent une connexion permanente : compte en ligne, stockage dans le nuage,
traitement des documents sur les serveurs de l'éditeur. Pour des archives administratives, médicales, juridiques ou
du personnel, ce modèle pose une question simple : **faut-il vraiment que ces documents quittent vos locaux ?**

## Ce qui part en ligne avec un outil « cloud »

Pour inventorier des archives, un outil en ligne reçoit en général :

- les **photos ou scans** des documents, avec tout ce qui y est écrit : noms, adresses, décisions, montants ;
- le **texte lu** par la reconnaissance de caractères (OCR), souvent faite sur les serveurs de l'éditeur ou d'un
  tiers ;
- l'**inventaire** lui-même, c'est-à-dire la carte de ce que vous conservez et où.

Ces données sont alors soumises aux conditions de l'éditeur, à la localisation de ses serveurs et à ses
sous-traitants. Pour des données personnelles, la loi n° 09-08 encadre ce traitement et, selon les cas, le transfert
de données vers l'étranger : autant de démarches et de risques qu'un traitement sur place évite.

## Les avantages d'un inventaire hors ligne

- **La maîtrise** : les documents ne quittent pas le bâtiment ; la question du transfert ne se pose pas.
- **La continuité** : pas de coupure de réseau qui arrête le travail, ni d'abonnement dont dépend l'accès à votre
  propre inventaire.
- **La simplicité dans les locaux d'archives** : les dépôts sont souvent en sous-sol ou dans des bâtiments où le
  réseau mobile passe mal.

## Ce que cela implique en pratique

Travailler sans Internet n'est pas une contrainte si l'outil est conçu pour cela :

1. **Les téléphones ou tablettes de saisie** stockent tout localement, en mode avion, et transfèrent leurs données
   par câble.
2. **Le traitement** (lecture des documents, extraction des informations, recherche) tourne sur un PC de
   l'organisation, ce qui suppose un PC suffisamment puissant.
3. **L'installation et les mises à jour** arrivent sur une clé USB, contrôlée avant installation.
4. **Les sauvegardes** sont de votre responsabilité : copie régulière sur un disque externe, rangé en lieu sûr.

## Comment vérifier que rien ne sort

« Hors ligne » doit se vérifier, pas seulement se promettre. Trois contrôles simples :

- **Débrancher le réseau** du PC et vérifier que tout fonctionne : import, lecture, recherche, export.
- **Vérifier que les programmes ne peuvent pas joindre l'extérieur**, même si le PC était branché par erreur : un
  outil sérieux le permet par conception (réseau interne isolé, programmes qui n'écoutent que sur le PC lui-même).
- **Lire la documentation** : un éditeur qui ne dit pas clairement ce qui part en ligne en envoie probablement.

## Organiser un chantier d'inventaire hors ligne

Un chantier sans Internet s'organise autour de quelques rôles simples :

- **Les agents de terrain** photographient et décrivent les boîtes avec des téléphones en mode avion.
- **Un responsable du poste central** reçoit les transferts, vérifie les rapports d'import et signale les anomalies
  (doublons, numéros manquants) le jour même.
- **Un administrateur** gère les comptes, les appareils, les mises à jour et surtout les **sauvegardes** : une copie
  régulière sur un disque externe, rangé dans un autre local.

Fixez aussi le **rythme des transferts** : en fin de journée ou de demi-journée, pour qu'un téléphone perdu ou
endommagé ne fasse jamais perdre plus que quelques heures de travail.

## L'exemple de notre logiciel

Notre [logiciel d'inventaire des archives](/logiciel-inventaire-archives/) a été conçu pour ce cas : les téléphones
Android restent en mode avion, les photos passent au PC par câble USB, la lecture en arabe et en français, l'extraction
des champs et la recherche se font sur le PC. Dans l'installation avec Docker, les services tournent dans un réseau
interne sans route vers l'extérieur, et la vérification d'installation, à faire réseau coupé, contrôle qu'aucun service
ne peut joindre Internet. Le détail est sur la page [sécurité et confidentialité](/logiciel-inventaire-archives/securite-confidentialite/).

Ce choix a un prix, qu'il faut connaître : la lecture se fait à la vitesse du PC, les mises à jour se font à la main,
et la sauvegarde ne se fait pas toute seule hors du bâtiment. Pour des archives confidentielles, c'est souvent un
prix raisonnable.
