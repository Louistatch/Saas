# HarooLife V3 — avatars habillés, interactions et carte inspirée de Lagos Life

Ce document décrit ce que la V3 change dans le HarooLife existant (`/haroolife`) et sur quelles
conventions ces changements reposent. Les preuves d'exécution sont dans
`artifacts/haroolife-correction-evidence.md` ; la liste des défauts et des causes est dans
`artifacts/haroolife-correction-progress.md`.

## Conventions de personnage

- **Cap** : `heading = atan2(dx, dz)`, 0 = +Z. PlayCanvas reçoit des degrés, Three des radians.
- **Orientation des GLB** : les quatre adultes Quaternius (Women_Casual, Women_Formal, Casual_2,
  Casual_Hoodie) et les minis Kenney regardent +Z en pose de liaison et dans tous leurs clips.
  Le catalogue n'applique donc aucun yaw (`yaw: 0`). L'ancien yaw de 180° provoquait le moonwalk.
- **Cadence** : chaque modèle porte sa cadence mesurée (`pace.walk`, `pace.run`, en hauteurs de
  figure par seconde, clips sur place). La vitesse du clip suit la vitesse au sol :
  `clipRate = clamp(vitesseSol / (pace × hauteurFigure), 0,5, 3)`.
- **Échelles** : rue `STREET_SCALE = 1.5` (≈ 1,19 u), intérieur `INTERIOR_SCALE = 1.35` (≈ 1,07 u).
- **Tenue** : chaque modèle déclare les rôles de ses matériaux (`pagneMaterials` pour le haut
  personnalisable, `outfit` pour bas/chaussures/ceinture, `hairMaterials`, `skinMaterials`). La
  recoloration part toujours du matériau source mémorisé, jamais d'un clone déjà recoloré.
- **Anciennes sauvegardes** : un mini enregistré (`character-*-a/b/c`) s'affiche en adulte habillé
  via `shownModel()` ; la valeur stockée n'est pas réécrite. Un mini choisi explicitement dans
  « Personnages classiques » reste un mini (`classic: true`).

## Cycle d'interaction

Toucher un meuble, un PNJ ou un bouton d'activité suit toujours le même cycle :
**toucher → approche → orientation → activité → effet unique**.

- L'approche vise la face libre la plus proche du meuble (avant, puis côtés, puis arrière).
- L'effet du domaine (`lome-life-engine` / `city/life`) n'est appliqué qu'à l'arrivée, une seule
  fois ; un second toucher pendant l'approche ne double rien.
- Le joystick annule l'objectif. Un objectif bloqué plus de 1,6 s affiche « inaccessible ».

## Carte

- **Mode carte** séparé du jeu (onglet Carte) : caméra aérienne, joystick et bouton Entrer masqués,
  filtres seulement en mode carte, bouton « Noms » désactivé par défaut, 8 noms au plus, priorité
  à la sélection puis au centre de l'écran, chevauchements masqués, cibles de 44 px.
  « Retour au jeu » revient à la caméra rapprochée.
- **Composition** : parcs plus fréquents, immeubles de remplissage plafonnés à 5 étages, tours du
  kit Commercial réservées aux lieux nommés, zone industrielle à Lomé (port, x 88–106, y 53–68).
  Les identifiants de lieux existants sont conservés.

## Modèle → lieu → interaction

| Modèle (kit) | Lieu existant | Interaction branchée |
|---|---|---|
| Women_Casual « Afi », Women_Formal « Abra », Casual_2 « Kossi », Casual_Hoodie « Koffi » (Quaternius) | Joueur, PNJ, piétons, joueurs distants | Marche/course orientées, cadence mesurée ; tenue personnalisable (Apparence) |
| Cuisinière, lit, douche, WC, canapé (Kenney Furniture + formes du projet) | Maison du joueur | Manger, Dormir, Se laver, Toilettes, Se détendre : approche puis effet unique sur les besoins |
| PNJ de la maison et des lieux | Intérieurs | Toucher → approche → fiche « Personnage du jeu (PNJ) » → Saluer et discuter (`socialize`) |
| Tapis, vélo, banc, tapis de yoga, douche (formes du projet) | Salle Fitness Tokoin (sport) | Activités payantes du domaine, approche puis effet |
| `ind-h/i/j/k/s`, `ind-e/l/m`, `container-a/b/c`, `tank-large`, `water-tower` (City Industrial) | Entrepôts de la zone industrielle (nouveau type `industry`) | Entrer → hall → « Petit boulot » (+1 500 FCFA, une fois par jour) |
| `sky-a…e` (City Commercial) | Hôtels et immeubles nommés de grande hauteur | Fiches de lieu existantes (Prendre une chambre…) |
| `parasol-a/b` (City Commercial) | Marchés | Acheter un repas, offres de producteurs |
| `com-*`, maisons suburbaines, routes, voitures (kits déjà présents) | Tous les autres lieux | Inchangé |

## Licences

- Kenney (City Commercial, City Suburban, City Industrial, City Roads, Car, Mini Characters,
  Mini Market, Nature, Furniture) : CC0 1.0.
- Quaternius (Ultimate Modular Women / Men) : CC0 1.0.

Les modèles sont bakés dans `public/haroolife/city/kenney-pack.{json,bin}` par
`scripts/haroolife-bake-models.mjs`, avec la palette (`colormap.png`) propre à chaque kit.

## Limites de cette tranche

- Pas de conversation privée entre joueurs, de transfert de monnaie de jeu ni d'invitations : ces
  fonctions demandent un contrat serveur (participants, historique, idempotence) et viennent après
  le parcours de base.
- Pas de clip assis ou couché pour les adultes : le lit et le canapé jouent l'animation disponible
  la plus proche.
- Aéroport non recomposé ; Kara n'a pas de zone industrielle.
- Les mesures navigateur sont faites sous Chromium + SwiftShader (rendu logiciel), pas sur Android.
