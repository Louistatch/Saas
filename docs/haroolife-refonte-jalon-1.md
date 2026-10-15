# HarooLife — refonte, jalon 1 : la maison dans le moteur HarooLife

Source de la demande : `HAROOLIFE_PACK_REFONTE_CLAUDE.zip` → `01_PROMPT_REFONTE.md`.
Référence visuelle : le prototype « Une vie à Lomé » (`scene.js`, `sim.js`), lancé et capturé en local.

## Ce qui change

- Le moteur HarooLife est un moteur Three.js impératif. Il est monté dans une frontière React cliente.
  - `lib/haroolife/game/core/` contient la géométrie de la maison, les points d'interaction et le pathfinding A*. Ce code est pur et testé.
  - `lib/haroolife/game/render/house-world.ts` porte la classe `HouseWorld`. Elle possède la scène, l'avatar, les animations, la caméra, le picking et la boucle `requestAnimationFrame`.
  - `components/haroolife/game/haroo-house-view.tsx` est la frontière React. Elle crée le canevas et la couche des marqueurs, puis appelle `init()` au montage et `dispose()` au démontage.
- `HouseWorld.dispose()` libère tout ce que l'instance possède :
  - la boucle d'affichage, les écouteurs, le `ResizeObserver` et les marqueurs du DOM ;
  - les mixers, les squelettes, les géométries, les matériaux, les textures et le renderer.

  Le double montage du mode strict et les allers-retours ne laissent donc rien derrière eux.
- Nouveau renderer `haroo`, utilisé par défaut. La maison passe par le moteur HarooLife ; les autres intérieurs restent sur React Three Fiber jusqu'à leur portage, et la rue reste sur PlayCanvas.
- La bascule est réversible :
  - `?engine=three` rend la maison à React Three Fiber ;
  - `?engine=playcanvas` rend tout à PlayCanvas.
- Aucune seconde économie : chaque point de la maison (🌙 🍲 🛋️ 💬 🚿 🚽) nomme un équipement existant de `layoutFor('house')`. À l'arrivée, l'équipement passe par `onUse`, et le jeu (`lome-life-engine`) applique l'effet et sauvegarde.
- Sont conservés tels quels : les comptes, l'identité FaîtiereHub, les sauvegardes (`haroolife.lome-city.v1`) et les services.
- Les meubles sont les 15 GLB Kenney Furniture Kit du prototype (CC0), copiés dans `public/haroolife/assets/furniture/`. Leurs licences sont dans `public/haroolife/assets/licenses/`.
- L'avatar est le modèle Quaternius du Saas, cloné avec `SkeletonUtils`. La peau, les cheveux et les vêtements sont recolorés sur des matériaux propres à l'instance.
- Les personnages classiques (mini) sont mis à la même taille que les adultes et portent leur pagne.
- Seuls les clips réels sont utilisés (Idle, Walk, Run, Idle_Neutral). Pour dormir, le personnage se tient au lit en Idle_Neutral, comme dans le prototype : il n'existe pas de clip allongé.

## Marche

- La direction suit le stick par rapport à la caméra :
  - écran haut → s'éloigner de la caméra ;
  - écran droite → droite de la caméra.
- Le personnage regarde la direction voulue, même quand il glisse le long d'un meuble. C'était la cause du « moonwalk » observé contre les obstacles.
- La marche est l'allure par défaut. Shift, ou le joystick poussé au bord, fait courir.
- Vitesses : marche 1,3 u/s, course 2,4 u/s.
- La cadence des clips est calculée sur la foulée mesurée de chaque modèle : `vitesse / (pace × 1,85)`. Cela donne ×1,1 à ×1,4 selon le modèle, sans pieds qui glissent.
  - Le prototype marchait à 2,4 u/s avec des clips à ×1, donc les pieds glissaient.

## Vérifications (SwiftShader, logiciel, sans GPU)

| Vérification | 412 × 915 | 1440 × 900 |
|---|---|---|
| Maison prête après « Entrer » | 0,4–0,7 s | 1,0 s |
| 8 directions : alignement déplacement / stick | 1,000 | 1,000 |
| 8 directions : regard / stick | 1,000 | 1,000 |
| Clip en marchant / avec Shift | Walk / Run | Walk / Run |
| Manger (🍲) : faim | 75 → 100, une seule fois | 75 → 100, une seule fois |
| Dormir (🌙) : énergie | 73 → 100 | 73 → 100 |
| Rechargement : dans la maison, besoins conservés | oui | oui |
| 3 sorties / entrées : canevas, textures, buffers, marqueurs | 2 / 12 / 73 / 7, stables | 2 / 12 / 73 / 7, stables |

À 1440 px, SwiftShader rend moins de 10 images/s. Le pas de temps est plafonné à 100 ms, donc la distance parcourue par seconde y est plus faible que sur un vrai GPU. Ces mesures ne sont pas des performances d'appareil réel.

Les deux canevas sont la rue PlayCanvas, en pause et sans rendu, et la maison. Il n'y a pas de troisième canevas actif.

Tests ajoutés :
- `tests/haroolife-game-house.test.ts` (unitaires) : pathfinding, et pour chaque point : un équipement Saas réel, sur un sol libre, atteignable depuis l'apparition ;
- `e2e/lome-house-haroo.spec.ts` (bout en bout) : directions au joystick tactile et au clavier, repas unique, sommeil, rechargement, cycles sortie / entrée.

## Hors de ce jalon (jalon 2)

Restent à faire :
- la rue ;
- la carte lisible avec les identifiants de destination existants ;
- le trajet ;
- les autres intérieurs ;
- l'achat au marché ;
- la mission.

PlayCanvas et React Three Fiber ne seront retirés qu'une fois la parité atteinte.

---

# Jalon 2 (première partie) : tous les intérieurs du Saas dans le moteur HarooLife

## Ce qui change

- `HouseWorld` devient `RoomWorld` (`lib/haroolife/game/render/room-world.ts`). Ce moteur unique dessine n'importe quelle pièce décrite par une `RoomScene` (`lib/haroolife/game/core/scene.ts`) :
  - la maison du prototype (`HOUSE_SCENE`) ;
  - chaque intérieur du Saas, converti depuis son layout existant (`sceneFromLayout`) : salle de sport, commerce, boulangerie, bureau public, puits, lieu de culte, clinique, jardin.
- Le renderer `haroo`, utilisé par défaut, couvre donc tous les intérieurs. `?engine=three`, puis `?engine=playcanvas`, restent les retours en arrière.
- Les identifiants des équipements, des actions et des PNJ sont ceux du Saas. L'arrivée à un point appelle les règles existantes :
  - `useProp` pour les lieux de la ville ;
  - `action` pour la maison ;
  - `onTalk` pour les PNJ.
- Transformation documentée : coordonnées de la scène = coordonnées du layout × `LAYOUT_SCALE` (1,6). Les layouts avaient été dessinés pour des figurines d'environ 0,9 unité ; l'avatar adulte mesure 1,85 unité. Les positions métier et la sauvegarde ne changent pas.
- Les objets primitifs des équipements (`prop-shapes`) sont fusionnés en un maillage par matériau. Les modèles Kenney Furniture Kit sont recentrés, et leur emprise mesurée (`KIT_SIZE`) sert aux collisions et aux points d'approche.
- Sur une machine (tapis, vélo, banc, tapis de sol), le personnage monte dessus pendant l'activité, puis en redescend au premier mouvement.
- Pièces plus grandes que la maison : la caméra suit le joueur au zoom de la maison. Seuls les points à portée (4,5 u ; 3 u pour les PNJ), la sortie et la cible en cours sont marqués, pour que la salle de sport reste lisible sur téléphone. Le reste s'atteint par « Activités du lieu ».
- Le mouvement est intégré en pas de 50 ms au plus, avec un plafond de 250 ms par image. La vitesse réelle ne dépend plus de la fréquence d'images. Sans ce changement, à 5 images/s, le joueur avançait à moitié de sa vitesse.
- Correctif du jeu : un voyage vers une autre ville (car vers Kara) quitte désormais le mode carte, comme les autres départs. Avant, on arrivait à Kara sur la carte, sans pouvoir marcher.
- Tests de bout en bout : les sélecteurs sont alignés sur le HUD actuel de `main` (le bouton d'état n'a plus `role="status"`), et la carte se quitte par « Retour au jeu ».

## Vérifications (SwiftShader)

| Parcours | 412 × 915 | 1440 × 900 |
|---|---|---|
| Salle de sport : « Tapis de course » → marche → sur la machine, clip Run | forme 0 → 6, énergie 85 → 70 | idem |
| Commerce : « Acheter un repas » → comptoir | repas 1 → 2, solde −650 FCFA, une seule fois | idem |
| Commerce : toucher la vendeuse | fiche « Conversation », personnage du jeu (PNJ) | idem |
| Maison (non-régression) | faim 75 → 100, énergie 73 → 100, rechargement conservé, cycles stables | idem |

Tests unitaires : pour chacun des 9 intérieurs, l'apparition se fait sur un sol libre, chaque activité du layout a un point atteignable, et les identifiants sont ceux du Saas. Il existe aussi une sortie.

## Encore à faire (suite du jalon 2)

Ces étapes demandent de remplacer la ville PlayCanvas, qui porte aujourd'hui la marche, le taxi, les trajets, les coopératives, les panneaux et la présence. Elles se feront par étapes, sans retirer l'existant avant la parité :
- la rue courte avec commerces et piétons ;
- la carte stylisée par quartiers ;
- les transports.
