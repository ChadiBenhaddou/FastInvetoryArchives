---
title: "OCR des documents en arabe : possibilités et limites"
description: "Ce que la reconnaissance de texte arabe sait faire, ce qui la rend difficile, les moteurs disponibles et comment évaluer l'OCR sur vos propres documents."
slug: ocr-documents-arabes-possibilites-limites
pubDate: 2026-10-26
author: "Équipe Inventaire rapide des archives"
category: numerisation-ocr-recherche
tags: ["OCR", "arabe", "numérisation", "reconnaissance de texte"]
primaryKeyword: "OCR arabe"
secondaryKeywords: ["OCR documents arabes", "reconnaissance de texte arabe", "OCR arabe français"]
offer: inventaire
sources:
  - title: "Tesseract OCR (projet officiel, dépôt GitHub)"
    url: "https://github.com/tesseract-ocr/tesseract"
  - title: "PaddleOCR (projet officiel, dépôt GitHub)"
    url: "https://github.com/PaddlePaddle/PaddleOCR"
---

Faire lire automatiquement des documents arabes par un ordinateur (OCR, reconnaissance optique de caractères) est
possible et utile, à condition de savoir ce que l'on peut en attendre. Voici un point honnête, issu de notre
expérience sur des documents administratifs marocains en arabe et en français.

## Pourquoi l'arabe est plus difficile que le français

- **L'écriture est liée** : la plupart des lettres se rattachent à leurs voisines, et une même lettre change de forme
  selon sa position (isolée, initiale, médiane, finale). Le moteur doit découper le mot en lettres ou le reconnaître
  d'un bloc.
- **Les points comptent** : plusieurs lettres ne se distinguent que par le nombre ou la position de leurs points (ب ت
  ث ن ي). Une photo un peu floue ou un tampon peuvent les effacer.
- **Les voyelles sont rarement écrites**, et l'orthographe varie : hamza écrite ou non (أ / إ / ا), ta marbouta ou ha
  (ة / ه), alif maqsoura ou ya (ى / ي).
- **Le sens de lecture se mélange** : le texte se lit de droite à gauche, mais les nombres, les dates et les passages
  en français de gauche à droite, souvent dans la même ligne.
- **Les documents administratifs sont bilingues** : en-tête en arabe, corps en français, ou l'inverse.

## Ce que les moteurs actuels savent faire

Sur des **documents imprimés**, photographiés correctement, les moteurs modernes lisent la plupart du texte arabe.
Parmi les moteurs libres, utilisables sans envoyer les documents en ligne :

- **Tesseract**, projet libre de longue date, qui dispose de modèles pour l'arabe et le français ;
- **PaddleOCR**, plus récent, qui propose des modèles de reconnaissance arabe et latine fondés sur l'apprentissage
  profond.

Les résultats varient beaucoup d'un document à l'autre. Dans nos essais, la qualité dépend d'abord de la **photo**
(netteté, lumière, page à plat), ensuite du **type de document**, et seulement après du moteur.

## Les limites à connaître

- **Le manuscrit** : l'écriture manuscrite arabe reste mal lue par les moteurs généralistes. Mieux vaut le savoir et
  le repérer que l'espérer.
- **Les tampons, signatures et documents abîmés** produisent du bruit dans le texte lu.
- **Les mises en page complexes** (tableaux, colonnes) peuvent mélanger l'ordre de lecture.
- **La vitesse** dépend du matériel : sur un PC sans carte graphique, un moteur fondé sur l'apprentissage profond prend
  plusieurs secondes par page.

## Faire avec les erreurs plutôt que les cacher

Un OCR parfait n'existe pas. Ce qui compte, c'est que les erreurs soient **visibles** et **corrigeables** :

- signaler les pages lues avec une **confiance faible** ou **probablement manuscrites** ;
- rendre la **recherche tolérante** aux variantes d'écriture arabe et aux fautes, pour retrouver un document même si
  un mot a été mal lu ;
- garder la **photo** à côté du texte lu, pour vérifier d'un coup d'œil.

## Comment évaluer l'OCR sur vos documents

Ne vous fiez à aucun chiffre général, le nôtre compris : testez sur **vos** documents.

1. Choisissez une cinquantaine de pages représentatives : différentes années, services, qualités.
2. Faites-les lire, puis comparez avec le document pour les informations qui vous importent (type, date, référence,
   noms).
3. Notez le taux de réussite **par information**, pas seulement « le texte est-il lisible ».
4. Mesurez le temps par page sur le PC qui servira réellement.

## Préparer des photos qui se lisent bien

La qualité de lecture se joue en grande partie au moment de la photo :

- **Page à plat**, bien remplie dans le cadre, sans doigts ni objets dessus.
- **Lumière homogène**, sans ombre portée du téléphone ; une lampe d'appoint si le local est sombre.
- **Appareil immobile**, à une distance constante, et une photo reprise immédiatement si elle est floue.
- **Une page par photo** : deux pages côte à côte divisent la résolution utile par deux.

Un contrôle de netteté et de luminosité au moment de la prise de vue, sur le téléphone, évite d'envoyer à l'OCR des
images qu'il ne pourra pas lire.

## Dans notre logiciel

Notre [lecture OCR arabe et français](/logiciel-inventaire-archives/ocr-arabe-francais/) s'appuie sur PaddleOCR
(PP-OCRv5, modèles arabe et latin), avec Tesseract en secours dans l'installation Docker, et, en option sous Windows
11, sur le moteur de l'Outil Capture d'écran, plus rapide et meilleur sur l'arabe dans nos essais, mais dont la
licence doit être validée par le client. Mesuré sur un portable Core i5-11300H avec 16 Go de mémoire : environ
0,8 seconde par photo avec ce moteur Windows, environ 6 à 15 secondes avec PaddleOCR. Les pages douteuses sont
signalées, la recherche tolère les variantes d'écriture arabe, et chaque document peut être corrigé. Pour un projet
d'extraction de données propre à vos documents, voyez aussi notre offre
[OCR et extraction de documents arabes sur mesure](/applications-sur-mesure/ocr-extraction-documents-arabes/).
