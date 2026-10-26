---
title: "Numéroter et étiqueter des boîtes d'archives sans erreur"
description: "Comment attribuer un numéro unique à chaque boîte d'archives, l'écrire lisiblement et détecter les erreurs de recopie grâce à une lettre de contrôle."
slug: numeroter-etiqueter-boites-archives-sans-erreur
pubDate: 2026-10-26
author: "Équipe Inventaire rapide des archives"
category: inventaire-recolement
tags: ["boîtes d'archives", "numérotation", "inventaire", "méthode"]
primaryKeyword: "numérotation des boîtes d'archives"
secondaryKeywords: ["étiqueter des boîtes d'archives", "cotation des boîtes d'archives", "code de contrôle"]
offer: inventaire
---

Dans un inventaire, une boîte n'existe que par son numéro. Si ce numéro est mal écrit, mal recopié ou donné deux
fois, la boîte devient introuvable, ou pire, deux boîtes se mélangent dans l'inventaire. Les règles ci-dessous
évitent l'essentiel de ces erreurs.

## Les trois erreurs les plus fréquentes

1. **Le doublon** : deux équipes, ou deux journées, donnent le même numéro à deux boîtes différentes.
2. **La recopie** : le numéro écrit sur la boîte et le numéro saisi dans l'inventaire ne sont pas les mêmes (un
   chiffre faux, deux chiffres inversés).
3. **L'illisibilité** : un numéro écrit trop petit, sur un seul côté, ou avec des caractères qui se confondent
   (0 et O, 1 et I, 5 et S, 8 et B, 2 et Z).

## Règle 1 : une série par équipe

Le moyen le plus simple d'éviter les doublons est de **séparer les séries** : chaque équipe (ou chaque appareil de
saisie) reçoit un préfixe qui lui est propre, par exemple une lettre. L'équipe A numérote A-0001, A-0002…, l'équipe K
numérote K-0001, K-0002… Deux équipes ne peuvent alors jamais produire le même numéro, même si elles travaillent le
même jour dans le même local.

Conservez le registre des préfixes attribués, et ne réutilisez jamais un préfixe pour une autre équipe : sinon, les
anciens numéros risquent de revenir.

## Règle 2 : un numéro qui se vérifie lui-même

Une erreur de recopie ne se voit pas : A-0123 et A-0132 sont deux numéros tout à fait plausibles. La solution
classique, utilisée pour les numéros de compte bancaire ou les codes-barres, est le **caractère de contrôle** : un
dernier caractère calculé à partir des autres. Si un chiffre est mal recopié, le caractère de contrôle ne correspond
plus, et l'erreur est détectée au moment de la saisie.

Le choix du calcul compte. Un bon calcul doit détecter :

- **un chiffre faux** (0123 au lieu de 0128) ;
- **deux chiffres voisins inversés** (0132 au lieu de 0123), l'erreur de recopie la plus fréquente ;
- **un mauvais préfixe** d'équipe.

Une simple somme des chiffres ne suffit pas : elle ne voit pas les inversions, puisque 1+3 = 3+1. Il faut pondérer
chaque position par un coefficient différent, et choisir les coefficients pour que toutes ces erreurs changent le
résultat.

## Règle 3 : un alphabet sans ambiguïté

Si le préfixe et le caractère de contrôle sont des lettres, **écartez celles qui ressemblent à des chiffres** : O, I,
S, B et Z. Il reste 21 lettres, largement assez. Écrits à la main sur du carton, puis relus par une autre personne
ou photographiés, les codes restent ainsi lisibles sans hésitation.

## Règle 4 : écrire gros, deux fois

- Écrire le numéro **au marqueur**, en **grands caractères**, sur **deux côtés** de la boîte : celui qui fait face
  à l'allée et le dessus (ou un autre côté visible si les boîtes sont empilées).
- Ne pas utiliser d'étiquette autocollante seule : elle se décolle avec le temps et l'humidité.
- **Photographier le numéro écrit** sur la boîte : en cas de doute plus tard, la photo tranche.

## Règle 5 : annuler plutôt que réutiliser

Une boîte commencée puis abandonnée (mauvais numéro écrit, boîte vide) : **barrez le numéro et notez-le comme
annulé**, ne le réutilisez pas. Ainsi, un numéro absent de l'inventaire s'explique toujours : soit il est annulé, soit
la boîte manque et il faut la chercher.

## Une fiche à donner aux équipes

Résumez ces règles sur une page, affichée dans le local et remise à chaque agent :

1. Je n'utilise que **ma** série de numéros (mon préfixe).
2. J'écris le numéro **au marqueur**, en **grand**, sur **deux côtés**.
3. Je **photographie** le numéro écrit.
4. Si je me trompe, je **barre** et je déclare le numéro **annulé** : je ne le réutilise jamais.
5. En fin de journée, je **transfère** mes données et je vérifie qu'aucun numéro ne manque.

## Comment le logiciel applique ces règles

Notre [application de capture Android](/logiciel-inventaire-archives/capture-android/) applique ces cinq règles
automatiquement. Chaque téléphone a sa lettre ; il génère des codes du type `A-0123-N`, dont la dernière lettre est
une lettre de contrôle qui détecte un chiffre faux, deux chiffres voisins inversés, une mauvaise lettre d'appareil ou
une mauvaise lettre de contrôle. L'alphabet exclut O, I, S, B et Z. L'agent photographie le code écrit sur la boîte ;
le PC affiche cette photo à côté du code enregistré, et signale les numéros jamais reçus, en distinguant ceux qui ont
été annulés sur le téléphone. Pour la suite de la démarche, voir
[comment réaliser l'inventaire des archives administratives](/blog/comment-realiser-inventaire-archives-administratives/).
