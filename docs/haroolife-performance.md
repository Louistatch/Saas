# HarooLife Lomé 3D — performance (jalon 1)

Mesures prises par `e2e/lome-perf.spec.ts` sur le build de production, dans Chromium headless
avec SwiftShader (rendu WebGL **logiciel**, sans GPU). Ce n'est **pas** un appareil réel : les
temps de frame et les FPS de ce banc ne sont pas transposables à un téléphone ; en revanche les
compteurs côté CPU et moteur (appels de rendu, entités, instances de maillage, figures animées,
re-renders React, mémoire, octets transférés, temps d'entrée/sortie) sont de vraies mesures de
ce que le moteur demande, et c'est sur eux que porte la comparaison. Aucune mesure sur Android
réel n'a encore été faite : la cible « 30 FPS stables sur Android milieu de gamme » reste à
vérifier sur appareil.

## Ce que la sonde mesure

`window.__LOME_PERF` (sonde dans `components/haroolife/city/city-world.tsx`, helpers purs dans
`lib/haroolife/city/perf.ts`) : temps de frame p50/p95/p99 par horloge réelle, appels de rendu
et triangles (statistiques PlayCanvas), entités avec rendu, instances de maillage, composants
d'animation et combien jouent, mémoire JS, long tasks, compteurs de re-render (`immersive`,
`world`, `chunks`, `agents`), ressources chargées, résolution et pixel ratio. Le scénario
Playwright ajoute les octets transférés par type, le nombre de requêtes et les temps de
navigation.

## Causes mesurées avant optimisation

1. **Boucle de re-render React** : la sonde d'état des chunks renvoyait un nouvel objet à chaque
   effet → `setChunkStats` → re-render de tout l'arbre → effet → … : 364 re-renders de
   l'interface en 10 s au repos, 20 534 pendant un glisser de caméra (chaque `pointermove`
   relançait un rendu complet). Chaque re-render refaisait aussi tourner l'effet de streaming.
2. **Parcelle du joueur** : 484 entités (une par case) plus leurs modèles → 674 entités rendues,
   739 instances de maillage, ~300 appels de rendu en vue aérienne et 606 pendant le glisser.
3. **Personnages** : 21 squelettes animés en même temps, dont la plupart loin de la caméra.
4. **Deux lumières directionnelles** sur toute la scène.
5. Les chunks étaient détruits en entrant dans un intérieur et reconstruits au retour (gel au
   retour : 1,2 s).

## Corrections appliquées

- États : l'état des chunks n'est mis à jour qu'en cas de changement ; les statistiques de
  frame ne passent plus par l'état React ; le glisser de caméra est coalescé par frame et
  appliqué à l'entité caméra, React n'est prévenu que toutes les 120 ms et au relâcher.
- Parcelle : le sol des 484 cases, le rivage, les arbres et les buissons forment **un seul
  maillage** (couleurs par sommet, modèles Kenney cuits) ; seules les constructions restent des
  entités cliquables ; les touches sur le sol passent par le sélecteur au sol de la ville.
- Agents : React ne décide plus que « qui existe » à chaque pas de circulation ; le mouvement
  entre deux pas est appliqué aux entités chaque frame sans re-render ; seuls les N piétons les
  plus proches sont des squelettes animés (N selon le préréglage), les autres sont des figures
  cuites statiques ; les zémidjans lointains ont le squelette en pause.
- Trois anneaux de détail : proche (modèles, accessoires, mobilier urbain), moyen (modèles
  principaux et silhouettes, sans accessoires), lointain (volumes colorés).
- Les chunks restent chargés mais invisibles pendant les intérieurs et les trajets.
- Lumière d'appoint seulement en qualité Élevé ; une directionnelle + ambiance sinon.
- Préréglages Économie / Équilibré / Élevé (`lib/haroolife/city/quality.ts`) : plafond de pixel
  ratio (1 / 1,5 / 2), anticrénelage, anneaux, budget de personnages animés et de piétons, rayon
  des véhicules ; choisis d'après l'appareil (mémoire, cœurs, mobile, économiseur de données,
  réduction des animations) et modifiables dans Téléphone → Qualité graphique (mémorisé).

## Avant → après (même build, mêmes scénarios, même banc)

### desktop

| Scénario | Draw calls avant → après | Entités rendues | Instances de maillage | Figures animées | Re-renders React (immersive) | Heap Mo |
|---|---|---|---|---|---|---|
| A_cold_open | 298 → 136 | 674 → 137 | 739 → 174 | 21 → 9 | 364 → 30 | 144 → 214 |
| B_tokoin_aerial | 294 → 138 | 671 → 137 | 736 → 174 | 20 → 10 | 854 → 44 | 176 → 226 |
| C_zoom_max | 14 → 12 | 667 → 137 | 732 → 174 | 17 → 9 | 2450 → 92 | 135 → 190 |
| D_camera_move | 606 → 283 | 673 → 136 | 738 → 173 | 19 → 9 | 20537 → 462 | 151 → 193 |
| E_gym | 292 → 292 | 134 → 164 | 146 → 176 | 7 → 7 | 22309 → 524 | 268 → 183 |
| F_back_to_city | 190 → 73 | 672 → 140 | 737 → 177 | 19 → 9 | 22612 → 532 | 175 → 199 |

Ouverture à froid : canvas visible 2527 → 1008 ms ; ville détaillée 6231 → 10116 ms ; transfert 7968 → 7778 Ko. Entrée en salle 4848 → 5587 ms ; retour en ville 1247 → 239 ms. Temps de frame après optimisation (horloge réelle, rendu logiciel) : ville p50 902.5 ms, salle p50 89.7 ms.

### mobile-android

Les appels de rendu « avant » sur mobile (40, 82…) sont sous-estimés : la sonde les lisait avant que le canvas ne soit à sa taille finale. Comparer plutôt les entités, les instances et les re-renders.

| Scénario | Draw calls avant → après | Entités rendues | Instances de maillage | Figures animées | Re-renders React (immersive) | Heap Mo |
|---|---|---|---|---|---|---|
| A_cold_open | 40 → 137 | 674 → 137 | 739 → 174 | 21 → 9 | 444 → 32 | 169 → 292 |
| B_tokoin_aerial | 40 → 141 | 672 → 135 | 737 → 172 | 20 → 9 | 762 → 44 | 185 → 296 |
| C_zoom_max | 4 → 12 | 668 → 138 | 733 → 175 | 18 → 9 | 1898 → 86 | 157 → 203 |
| D_camera_move | 82 → 294 | 680 → 140 | 745 → 177 | 23 → 9 | 9725 → 188 | 168 → 192 |
| E_gym | 292 → 292 | 134 → 164 | 146 → 176 | 7 → 7 | 10445 → 234 | 205 → 193 |
| F_back_to_city | 32 → 86 | 660 → 142 | 725 → 179 | 15 → 10 | 10624 → 242 | 125 → 185 |

Ouverture à froid : canvas visible 1892 → 949 ms ; ville détaillée 3783 → 8825 ms ; transfert 7797 → 7778 Ko. Entrée en salle 3202 → 4398 ms ; retour en ville 879 → 161 ms. Temps de frame après optimisation (horloge réelle, rendu logiciel) : ville p50 684.6 ms, salle p50 49 ms.

## Ce qui n'est pas fait

- Pas d'instancing matériel : les bâtiments sont fusionnés par chunk (batching statique), ce
  qui donne déjà un appel de rendu par chunk ; l'instancing apporterait peu ici.
- Pas de compression KTX2/Basis : le pack cuit n'utilise aucune texture ; les personnages
  utilisent une palette 512×512 unique par kit.
- Pas de mesure sur appareil Android réel ni de profil GPU : à faire avec un téléphone de test
  (Chrome DevTools distant), c'est la seule façon de valider la cible de 30 FPS.
- Le volume initial (≈ 8,6 Mo, dont 3,4 Mo de scripts et 2,2 Mo de pack) n'a pas été réduit
  dans ce jalon.
