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
