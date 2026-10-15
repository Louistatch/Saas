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

---

# Jalon 2 (deuxième partie) : la rue et la carte claire (`?street=haroo`)

## Ce qui change

**La rue.** Le moteur `StreetWorld` (`lib/haroolife/game/render/street-world.ts`) dessine le quartier autour du joueur. Les données viennent de la ville du Saas (`core/street.ts`) : terrain, routes, lots et leurs portes, domaine du joueur. Il ajoute 6 piétons, qui sont des personnages du jeu (PNJ), et le taxi.

**Les règles de marche ne sont pas dupliquées.** `StreetWorld` fait avancer le `PlayerController` existant (collisions, routes, portes, taxi) et renvoie ses événements au jeu, comme le faisait PlayCanvas. Les sauvegardes et les positions restent les mêmes : rechargement vérifié, (48, 30) → (48, 30), dans les deux moteurs.

**Les marqueurs de porte.** Les lieux nommés ont un marqueur à leur porte. Le toucher ouvre la fiche existante.

**Correspondance des coordonnées.** Cellule × `STREET_CELL` (2) = coordonnées de la scène. Les identifiants des lots ne changent pas.

**La carte claire.** `components/haroolife/game/city-map.tsx` est une carte SVG, sans contexte WebGL. Elle montre les quartiers nommés, l'eau, des routes continues, le domaine (« Mon domaine ») et le joueur (« Vous »).
- De loin, elle montre les destinations principales. En zoomant, elle montre tous les lieux nommés du filtre actif.
- Les noms s'affichent à la sélection, avec le bouton « Noms » ou de près.
- Aucun marqueur ne se chevauche : ils sont placés par priorité, le lieu sélectionné d'abord.
- Le toucher d'un lieu ouvre la fiche existante (nom, quartier, personnages, À pied / Zémidjan / Taxi avec coût et durée).
- « À pied » lance la vraie route et ferme la carte.

**La bascule.**
- `?street=haroo` active la rue et la carte claire ; ce choix est retenu sur l'appareil.
- `?street=playcanvas` revient à la rue PlayCanvas.
- PlayCanvas reste la rue par défaut jusqu'à la parité. Il manque encore à la nouvelle rue : les panneaux publicitaires, la présence d'autres joueurs, le modèle du taxi et la conduite.

## Vérifications (SwiftShader)

| Rue et carte | 412 × 915 | 1440 × 900 |
|---|---|---|
| Quartier dessiné | 154 bâtiments, 8 portes nommées, 6 piétons | idem |
| 4 directions (alignement, regard) | ≥ 0,92, ≥ 0,90 (glissement le long d'un bâtiment) | idem |
| Carte : lieux affichés, chevauchements | 14, 0 | 26, 0 |
| Fiche lieu, puis « À pied » | route de 9 à 10 cellules, carte fermée | idem |
| Erreurs de page | aucune | aucune |

Les tests de bout en bout de la suite complète sont à 44 réussis et 3 ignorés (comme en CI), plus la spécification HarooLife, 4 sur 4.

## Limites connues

- Dans la rue, le clavier fait courir. C'est la règle actuelle du `PlayerController` du Saas, qui court au-delà de 0,92 de déflexion, et la rue PlayCanvas fait pareil. À aligner sur la maison (Shift pour courir) dans une étape dédiée, car les tests du joueur existant en dépendent.
- Les bâtiments sont des volumes stylisés : ce ne sont pas encore les modèles Kenney de la ville.

---

# La nouvelle rue par défaut

- `DEFAULT_STREET = 'haroo'` : `/haroolife` ouvre la rue et la carte claire du moteur HarooLife.
- Retour en arrière, retenu sur l'appareil : `?street=playcanvas`. Cette rue PlayCanvas garde ce que la nouvelle n'a pas encore : les panneaux publicitaires dans la rue, les autres joueurs à l'écran, le modèle du taxi et la conduite.
- Les tests de bout en bout écrits pour la ville PlayCanvas (densité, panneaux, présence, temps réel, taxi) la testent toujours, grâce à l'option `street: 'playcanvas'` du fixture. Le parcours par défaut (maison, commerce, rue et carte) est testé avec `street: 'haroo'`.

---

# Panneaux et autres joueurs dans la nouvelle rue

- **Panneaux.** Ce sont les mêmes supports (`PLACEMENTS`), la même rotation (`campaignFor`, `ROTATION_MS`) et la même affiche (`drawPoster`, image optionnelle).
  - Ils sont construits à moins de 26 cellules et libérés au-delà de 34.
  - L'exposition est comptée par le même `ExposureTracker`, une face vue pendant 1 s au moins.
  - « Lire l'annonce » apparaît à moins de 2,2 cellules d'un panneau, à pied.
  - Le clic « En savoir plus » et l'envoi groupé des statistiques n'ont pas changé.
  - La logique commune (`supportsToBuild`, `supportsSeen`, `supportNear`) est sortie du composant PlayCanvas vers `lib/haroolife/ads/campaigns.ts`. Les deux rues l'utilisent.
- **Autres joueurs.** Ce sont les mêmes poses du relais temps réel, interpolées 220 ms dans le passé (`sampleAt`, déplacé vers `lib/haroolife/realtime/interpolate.ts`).
  - Chaque joueur est une figure adulte habillée, stable d'une session à l'autre, avec son pagne. Elle est nommée `Joueur <nom>`.
  - 12 joueurs au plus sont affichés. Un joueur silencieux depuis 4 s est masqué.
  - Un joueur qui quitte la présence est retiré.
- **Tests de bout en bout :**
  - le scénario temps réel tourne sur les deux rues ;
  - un scénario « panneaux » couvre la nouvelle rue : 2 supports, moins de 100 triangles par support, « Lire l'annonce », « En savoir plus », statistiques ;
  - le fixture épingle la rue au niveau du contexte, si bien que les pages ouvertes par un test suivent le même choix.

Il reste à porter dans la nouvelle rue le modèle du taxi et la conduite. Le taxi n'y est pour l'instant qu'un volume jaune.

---

# Taxi et conduite dans la nouvelle rue

- Le taxi est le modèle Kenney Car Kit (`car-kit/taxi.glb`, CC0), à l'échelle 1,3. Son avant suit +Z, comme le cap 0 du contrôleur : il n'y a pas de correction de 180°, qui était propre au pack PlayCanvas.
  - Les roues tournent selon la vitesse réelle, rapportée à leur rayon.
  - Les roues avant braquent selon le stick.
- La conduite reste celle du `PlayerController` partagé :
  - monter, accélérer, freiner, reculer, braquer, descendre ;
  - les roues doivent rester sur une route praticable.
  - Au volant, le personnage est masqué et la caméra s'élargit en douceur (× 1,35).
- **Correctif.** Les textures intégrées aux GLB (`colormap` du taxi) étaient décodées par `ImageBitmapLoader` au moyen de `fetch(blob:…)`. Le `connect-src` de la CSP refusait cet appel, si bien que le taxi apparaissait blanc, en local comme en production.
  - Le chargeur commun (`lib/haroolife/game/render/gltf.ts`) décode désormais ces images par une balise `<img>` sur une URL `blob:`, autorisée par `img-src`.
  - La CSP n'est pas élargie.
- Test de bout en bout, sur ordinateur et sur Android :
  - les quatre roues du modèle sont présentes ;
  - « Monter dans le taxi », vitesse > 2 cellules/s, freinage puis arrêt, plus de 2 cellules parcourues ;
  - « Descendre du taxi », le joueur à pied à côté de la voiture.

La nouvelle rue couvre maintenant ce que l'ancienne faisait : les panneaux, les autres joueurs, le taxi et la conduite. `?street=playcanvas` reste le retour en arrière.

---

# Bâtiments Kenney dans la nouvelle rue

- **Modèles.** Les bâtiments viennent du pack Kenney cuit (`kenney-pack.{json,bin}`), celui de la ville PlayCanvas. Ils sont choisis par le même catalogue `buildingFor` : modèle, orientation vers la porte, échelle, teinte, accessoires (auvents, arbres, clôtures, bancs…) et éléments propres au lieu.
  - Les éléments propres au lieu (dômes, minarets, clochers, croix, auvents de marché, champs, jetées, murs d'enceinte avec portail, enseignes, bancs, drapeaux) sont dessinés par des formes simples, aux couleurs du catalogue.
  - Le domaine du joueur utilise les mêmes modèles : `sub-a` (maison), `sub-t`, `sub-f`, `com-a`, `com-d`, `bush`, `tree`.
- **Chargement du pack.** Le chargement (empreinte de build, rechargement hors cache, modèle manquant non bloquant) est sorti de `model-bank.ts` vers `lib/haroolife/city/bank.ts`. Il ne dépend d'aucun moteur.
- **Unités.** Le catalogue place en unités PlayCanvas (1 cellule = 1,35). La rue convertit : positions en cellules × 2, hauteurs et échelles × 2/1,35.
- **Coût.**
  - Les bâtiments sont regroupés par tuiles de 8 × 8 cellules, chacune fusionnée en un seul maillage à couleurs de sommets, et mises en cache.
  - Les tuiles sont construites au fil du déplacement, une par image au plus, et libérées hors de portée (11 cellules).
  - Les modèles complets avec accessoires sont gardés à 8 cellules au plus. Au-delà, ce sont les modèles simplifiés de la ville (environ un cinquième des triangles), sans accessoires.

| Mesure (SwiftShader, 412 × 915) | Avant (un seul maillage) | Après (tuiles) |
|---|---|---|
| Reconstruction du quartier | 94 à 118 ms (saccade) | 1 à 4 ms (sol seul) |
| Construction d'une tuile | — | 0 à 25 ms, une par image |
| Triangles des bâtiments | 188 464 | 111 000 à 137 000 |

La ville PlayCanvas se fixe 160 000 triangles au niveau de qualité le plus bas (téléphones) : la rue reste en dessous.

Les volumes stylisés restent le repli honnête si le pack ne se charge pas.

---

# PlayCanvas retiré de la rue

La rue, sa carte et la scène de trajet ne chargent plus PlayCanvas. Chaque scène a son propre moteur HarooLife (Three.js impératif), son propre canvas, et une seule est montée à la fois.

| Scène | Avant | Maintenant |
|---|---|---|
| Rue | `StreetWorld`, avec l'application PlayCanvas en pause et masquée derrière (2 canvas) | `StreetWorld` seul (1 canvas) |
| Carte | Carte SVG, avec l'application PlayCanvas en pause derrière | Carte SVG seule, sans scène 3D |
| Trajet (« Trajet en cours ») | `Ride` dessiné par PlayCanvas | `RideWorld` (`lib/haroolife/game/render/ride-world.ts`) : boulevard, lampadaires, enclos, circulation dépassée, pluie réelle |
| Intérieurs | Moteur HarooLife (défaut) ou R3F (`?engine=three`) | Inchangé |
| Intérieurs `?engine=playcanvas` | Dans l'application de la rue | Module à part (`components/haroolife/city/playcanvas-interior.tsx`), chargé seulement sur ce choix |

- **Moteur PlayCanvas.** Son fragment (environ 2,1 Mo) n'est téléchargé que pour les intérieurs `?engine=playcanvas`.
- **Commutateur retiré.** `?street=` et le stockage `haroolife.street` n'existent plus : il n'y a qu'une rue.
- **Code PlayCanvas propre à la rue supprimé** : `player-rig.tsx`, `billboards-3d.tsx`, `remote-players.tsx`, ainsi que les morceaux internes de `city-world.tsx` (chunks, piétons, étiquettes projetées, colonne de zoom, gestes sur le canvas, taxi PlayCanvas).
  - Les fichiers encore importés par l'ancienne page `lome-life.tsx` (`city-chunks.tsx`, `city-world-3d.tsx`, `travel-scene-3d.tsx` pour `RideOverlay`) restent en place.
- **Sondes conservées pour les tests et le diagnostic.**
  - `StreetWorld` publie `__LOME_PERF` / `__LOME_PERF_RESET` (images, appels de dessin, triangles, tâches longues, mémoire).
  - `__LOME_CITY.chunks / buildings / tris / detailed` proviennent maintenant des tuiles de bâtiments : `chunks` = tuiles chargées, `tris` = triangles de ces tuiles.
- **Jour et nuit.** La rue suit à nouveau l'heure du jeu (`daylight`), comme la ville PlayCanvas : fond et lumières baissent la nuit, la palette du prototype reste le jour.
- **Panneaux.** Les poteaux et le cadre d'un panneau sont fusionnés en un seul maillage : 2 objets par support au lieu de 4.

Les tests qui mesuraient la ville aérienne PlayCanvas mesurent maintenant le quartier autour du joueur. Au départ (cellule 48, 34), on compte 16 tuiles et 211 bâtiments, contre ≥ 20 chunks et ≥ 250 bâtiments avant. Les gestes de caméra (glisser, pincer, boutons de zoom) sont testés sur la carte SVG.
