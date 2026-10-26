---
title: "Comment retrouver rapidement un dossier archivé"
description: "Localisation, description et recherche : ce qu'il faut mettre en place pour retrouver un dossier d'archives en quelques secondes, même en arabe."
slug: retrouver-rapidement-dossier-archive
pubDate: 2026-10-26
author: "Équipe Inventaire rapide des archives"
category: numerisation-ocr-recherche
tags: ["recherche documentaire", "arabe", "inventaire", "localisation"]
primaryKeyword: "retrouver un dossier archivé"
secondaryKeywords: ["recherche documentaire arabe", "recherche dans les archives", "localiser une boîte d'archives"]
offer: inventaire
---

Une demande arrive : « il nous faut le dossier de nomination de 2019 ». Dans beaucoup de services, la réponse prend des
heures, parfois des jours, à parcourir des boîtes. Retrouver vite un dossier repose sur trois éléments, dans cet ordre :
**savoir où est la boîte**, **savoir ce qu'elle contient**, **pouvoir chercher**.

## 1. Savoir où est la boîte

Sans localisation fiable, même un inventaire parfait ne sert à rien. Pour chaque boîte :

- un **numéro unique** écrit lisiblement sur la boîte (voir [numéroter des boîtes sans erreur](/blog/numeroter-etiqueter-boites-archives-sans-erreur/)) ;
- son **emplacement** : salle, étagère ou travée, rangée ;
- la **mise à jour** de cet emplacement à chaque déplacement.

Une règle simple aide beaucoup : une boîte sortie de son emplacement y revient, ou son nouvel emplacement est noté le
jour même.

## 2. Savoir ce qu'elle contient

La description doit porter sur ce que les gens demandent réellement. Dans un service administratif, les demandes
portent presque toujours sur :

- une **personne** (« le dossier de M. Benali ») ;
- une **référence** (« la décision n° 2019/145 ») ;
- une **date** ou une période ;
- un **objet** (« la nomination à Rabat »).

Relever ces informations pour chaque dossier, à partir de sa couverture ou de sa première page, couvre l'essentiel des
demandes. Une description trop pauvre (« Dossiers 2019 ») oblige à rouvrir les boîtes ; une description trop riche
(chaque pièce) ne sera jamais terminée.

## 3. Pouvoir chercher, y compris en arabe

Un tableau bien tenu permet déjà de filtrer par date ou par service. Mais pour chercher un nom ou un mot dans le texte,
il faut un outil de recherche, et pour l'arabe, un outil qui comprend ses particularités :

- **Les variantes d'écriture** : un même mot peut s'écrire avec ou sans hamza (أحمد / احمد), avec ta marbouta ou ha
  final (الإدارة / الاداره), avec alif maqsoura ou ya. Une recherche naïve manque la moitié des résultats.
- **Les voyelles et le tatweel** (allongement décoratif) doivent être ignorés.
- **Les chiffres** peuvent être écrits en chiffres arabes (2019) ou arabes-indiens (٢٠١٩).
- **Les fautes de frappe**, et les erreurs de lecture automatique, doivent être tolérées.

Côté français, la recherche doit de même ignorer les accents et tolérer les fautes.

## 4. Raccourcir le chemin jusqu'au document

Une fois le dossier trouvé dans l'inventaire, il reste à aller le chercher. Deux habitudes font gagner du temps :

- afficher, à côté du résultat, la **photo de la couverture** : on vérifie que c'est le bon dossier avant de se
  déplacer ;
- afficher l'**emplacement complet** : salle, étagère, rangée, numéro de boîte.

## Vérifier que votre organisation retrouve vite

Quelques indicateurs simples permettent de savoir si le dispositif fonctionne, sans outil particulier :

- **Le temps de réponse** à une demande de dossier, mesuré sur quelques demandes réelles, avant et après l'inventaire.
- **Le taux de dossiers non trouvés** : une demande qui reste sans réponse signale une boîte mal localisée ou une
  description insuffisante.
- **Les boîtes hors de leur emplacement** : un contrôle d'une travée prise au hasard, de temps en temps, montre si les
  emplacements sont tenus à jour.
- **Les demandes qui obligent à ouvrir plusieurs boîtes** : elles indiquent quelle information manque dans la
  description et qu'il faudrait relever à l'avenir.

Ces mesures disent aussi où porter l'effort : localisation, description ou recherche.

## Comment notre logiciel s'y prend

Notre [logiciel d'inventaire des archives](/logiciel-inventaire-archives/recherche-et-export/) relève l'emplacement de
chaque boîte à la capture, photographie chaque dossier et en lit le texte en arabe et en français. La recherche porte
sur tout le texte et les champs extraits (type, date, référence, titre, personnes, organismes), rapproche les variantes
d'écriture arabe (hamza, ة / ه, ى / ي, tatweel, voyelles, chiffres arabes-indiens), tolère les fautes, surligne les mots
trouvés et se filtre par type, période, salle, agent ou boîte. Un clic ouvre la boîte avec la photo du dossier.
