# HarooLife V3 — progression des corrections

Branche `feat/haroolife-v3-lagos`, partie de `main` 4d1a6a6 (fusion PR #41). Rendu réel :
rue en PlayCanvas, intérieurs en React Three Fiber + Rapier (défaut `three`).

## Défauts observés, causes confirmées, corrections

| Défaut observé (avant) | Cause confirmée | Correction |
|---|---|---|
| Moonwalk : le joueur et les PNJ adultes avancent dos à leur direction (produit scalaire −0,7 à −1 sur 10 segments, vidéo `v3-before`) | Les 4 GLB Quaternius regardent +Z en pose de liaison **et** dans tous leurs clips (contrôle vue de face, clip par clip) ; le catalogue leur ajoutait un yaw de 180° | `yaw: 0` pour tous les adultes (`avatar-catalogue.ts`) ; convention unique `heading = atan2(dx, dz)`, 0 = +Z, PlayCanvas en degrés, Three en radians |
| Glissement des pieds (patinage) | Cadence des clips fixe alors que la vitesse au sol varie (rue, intérieur, piétons, joueurs distants) | Cadence mesurée par modèle (`pace`, en hauteurs de figure par seconde, clips sur place) ; `clipRate = clamp(vitesseSol / (pace × hauteur), 0,5, 3)` appliqué partout via `groundSpeed` |
| Avatar blanc ou vêtements disparus après changement d'apparence / changement de lieu | Les matériaux recolorés étaient clonés depuis un matériau déjà recoloré puis détruits, et le matériau source était perdu | Matériau source mémorisé (`WeakMap` PlayCanvas, `userData.baseMaterial` Three), clones mis en cache par source, restauration avant destruction ; rôles de matériaux mesurés par modèle (`outfit`) : haut, bas, chaussures, cheveux différenciés |
| Anciens minis (Kenney) affichés enfants ou blancs | Les sauvegardes stockent `character-female-a…male-c` | `shownModel()` affiche l'adulte correspondant (female-a→afi, female-b→abra, female-c→afi, male-a→kossi, male-b→koffi, male-c→kossi) **sans réécrire la sauvegarde** ; choix explicite « classique » conservé (`classic: true`) |
| Toucher un meuble applique l'effet à distance, parfois deux fois | Pas de cycle d'approche dans l'intérieur Three | `Goal` (meuble, PNJ ou point) : approche par la face libre la plus proche → orientation → `onArrive` → effet unique ; anti-double déclenchement ; joystick annule l'objectif ; objectif bloqué → message « inaccessible » |
| Boutons de besoins de la maison sans déplacement | Actions appliquées directement depuis la feuille | Dormir / Se laver / Manger / Se détendre / Toilettes envoient une requête d'approche dans la maison ; l'effet s'applique à l'arrivée |
| Carte = jeu avec noms superposés, joystick visible | Une seule vue ; étiquettes sans priorité ni masquage | Mode carte séparé (caméra aérienne, joystick et Entrer masqués, filtres seulement sur la carte, bouton Noms désactivé par défaut, 8 noms max, priorité sélection puis centre, masquage des chevauchements, cibles 44 px) |
| Téléphone = liste plein écran, diagnostics visibles | — | `PhoneDevice` : appareil portrait, horloge, grille d'applis reliées aux modules existants ; diagnostic et qualité graphique dans Réglages → Avancé |
| Ville = nappe uniforme de tours (30 lots ≥ 6 étages, 30,4 % de surface bâtie) | Remplissage aléatoire sans zones | Zone industrielle (80 lots d'entrepôts, citernes, conteneurs, kits city-industrial), parcs plus fréquents, immeubles de remplissage plafonnés ; tours réservées aux lieux nommés. Mesure : 27,1 % bâti, 1 lot ≥ 6 étages. Identifiants des lieux conservés |
| Discussion avec un PNJ impossible dans la maison | `socialize` refusé hors des lieux publics | Règle du domaine étendue à la maison ; fiche « Personnage du jeu (PNJ) » → Saluer et discuter |

| Approche bloquée par les machines voisines (salle, mobile) | Ligne droite vers le point d'approche à travers les autres équipements | Chemin A* sur une grille de 0,25 u autour des meubles |
| Joueur entièrement caché à la sortie de la maison | Le parc de la parcelle se trouvait entre la caméra et la porte | Découpe : les objets hauts de la parcelle sur la ligne de visée sont masqués puis rétablis |
| Carte qui se refermait pendant une marche ; bouton qui disparaissait sous le doigt | La carte se fermait à chaque pas d'un itinéraire, puis via un effet décalé d'une image | Fermeture dans la même action que le départ d'une marche ou d'un trajet |
| Entrepôts sans action | Nouveau type de lieu sans activité | « Petit boulot » du domaine (une fois par jour) |

## Reste à vérifier / limites connues

- Conversation privée entre joueurs, transfert de monnaie de jeu, invitations/visites : non livrés dans cette tranche (le prompt les place après le parcours de base ; ils exigent un contrat serveur et des migrations).
- Événements à choix (atelier agricole, sport, AgriAcademy) : le mécanisme d'événements existant est conservé, pas de nouvel événement V3.
- Les adultes Quaternius n'ont pas de clip assis ni couché : lit et canapé jouent l'animation la plus proche.
- Aéroport non recomposé ; Kara n'a pas de zone industrielle.
- Toutes les mesures navigateur viennent de Chromium + SwiftShader (rendu logiciel), pas d'un appareil Android réel.
