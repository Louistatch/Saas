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

Les colonnes « après » datent du 12/10/2026, après la correction du canvas (voir plus bas) : les
premières mesures « après » du jalon 1 avaient été prises avec un canvas figé en bandeau 2:1
(412×206 px sur Pixel 7, 1440×720 sur desktop), donc avec un champ horizontal trop large et
plus de chunks visibles qu'en réalité. Elles sont remplacées ici par les valeurs mesurées
sur le canvas plein écran.

### desktop

| Scénario | Draw calls avant → après | Entités rendues | Instances de maillage | Figures animées | Re-renders React (immersive) | Heap Mo |
|---|---|---|---|---|---|---|
| A_cold_open | 298 → 42 | 674 → 137 | 739 → 174 | 21 → 9 | 364 → 28 | 144 → 219 |
| B_tokoin_aerial | 294 → 43 | 671 → 135 | 736 → 172 | 20 → 9 | 854 → 40 | 176 → 224 |
| C_zoom_max | 14 → 10 | 667 → 138 | 732 → 175 | 17 → 9 | 2450 → 88 | 135 → 190 |
| D_camera_move | 606 → 92 | 673 → 138 | 738 → 175 | 19 → 9 | 20537 → 454 | 151 → 194 |
| E_gym | 292 → 292 | 134 → 164 | 146 → 176 | 7 → 7 | 22309 → 511 | 268 → 183 |
| F_back_to_city | 190 → 72 | 672 → 140 | 737 → 177 | 19 → 9 | 22612 → 519 | 175 → 185 |

Ouverture à froid : canvas visible 2527 → 1878 ms ; ville détaillée 6231 → 10519 ms ; transfert 7968 → 7801 Ko. Entrée en salle 4848 → 5546 ms ; retour en ville 1247 → 306 ms. Temps de frame après optimisation (horloge réelle, rendu logiciel) : ville p50 1013 ms, salle p50 99 ms.

### mobile-android

| Scénario | Draw calls avant → après | Entités rendues | Instances de maillage | Figures animées | Re-renders React (immersive) | Heap Mo |
|---|---|---|---|---|---|---|
| A_cold_open | 40 → 16 | 674 → 137 | 739 → 174 | 21 → 9 | 444 → 30 | 169 → 311 |
| B_tokoin_aerial | 40 → 14 | 672 → 135 | 737 → 172 | 20 → 9 | 762 → 44 | 185 → 317 |
| C_zoom_max | 4 → 5 | 668 → 139 | 733 → 176 | 18 → 10 | 1898 → 82 | 157 → 203 |
| D_camera_move | 82 → 30 | 680 → 138 | 745 → 175 | 23 → 10 | 9725 → 282 | 168 → 195 |
| E_gym | 292 → 292 | 134 → 164 | 146 → 176 | 7 → 7 | 10445 → 319 | 205 → 209 |
| F_back_to_city | 32 → 34 | 660 → 136 | 725 → 173 | 15 → 9 | 10624 → 327 | 125 → 185 |

Ouverture à froid : canvas visible 1892 → 999 ms ; ville détaillée 3783 → 7597 ms ; transfert 7797 → 7801 Ko. Entrée en salle 3202 → 5188 ms ; retour en ville 879 → 282 ms. Temps de frame après optimisation (horloge réelle, rendu logiciel) : ville p50 435 ms, salle p50 96 ms.

En portrait, le champ visible couvre peu de chunks : les appels de rendu en ville sont
faibles (5 à 34) et c'est l'intérieur de la salle (292 appels : équipements, personnages,
mobilier non fusionnés) qui devient le poste le plus lourd. Le tas mémoire à l'ouverture
(≈ 310 Mo) reste au-dessus de ce que l'on souhaite sur un téléphone d'entrée de gamme.

### Correction du canvas (12/10/2026)

Le contrôleur de qualité appelait `app.resizeCanvas()` avant que le wrapper React fixe le
mode de remplissage ; le mode par défaut du moteur (conserver le ratio du canvas 300×150)
figeait le style en ligne à un bandeau 2:1. Détecté par le test anti-plateau mobile de
`e2e/lome-city.spec.ts` (93 % de ciel), corrigé par `updateCanvasSize()` sans toucher au
style, rejoué vert sur desktop et Pixel 7.

## Ce qui n'est pas fait

- Pas d'instancing matériel : les bâtiments sont fusionnés par chunk (batching statique), ce
  qui donne déjà un appel de rendu par chunk ; l'instancing apporterait peu ici.
- Pas de compression KTX2/Basis : le pack cuit n'utilise aucune texture ; les personnages
  utilisent une palette 512×512 unique par kit.
- Pas de mesure sur appareil Android réel ni de profil GPU : à faire avec un téléphone de test
  (Chrome DevTools distant), c'est la seule façon de valider la cible de 30 FPS.
- Le volume initial (≈ 8,6 Mo, dont 3,4 Mo de scripts et 2,2 Mo de pack) n'a pas été réduit
  dans ce jalon.
