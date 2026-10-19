# HarooLife — Jalon D, rapport d'avancement (D0 → D1 → D3)

Branche locale `feat/haroolife-national`. **Rien n'est poussé ni déployé sans accord explicite.**
État de référence et protocole Android : `docs/haroolife-jalon-d-baseline.md`.

## Tranche jouable livrée (D1 + D3)

| Critère de la mission | Réalisation | Preuve |
|---|---|---|
| Avatar visible et contrôlable dès la sortie d'un bâtiment, qui avance réellement dans l'espace 3D | `lib/haroolife/city/player.ts` : contrôleur continu (position en flottants, accélération/freinage, pivotement 600°/s, pas fixe 60 Hz, delta borné à 250 ms, rendu interpolé). `components/haroolife/city/player-rig.tsx` déplace l'entité PlayCanvas chaque image, sans `setState` par image ; React ne reçoit que les changements de case (≤ 1 par case) et la caméra à ≤ 4 Hz. | `e2e/lome-player.spec.ts` : positions sous-case, déplacement > 1,5 case, 8 directions |
| Joystick analogique 360°, zone tactile gauche, relâchement immédiat | `components/haroolife/city/joystick.tsx` : Pointer Events + `setPointerCapture`, base flottante, zone morte 12 %, vecteur normalisé, intensité proportionnelle (course à pleine déflexion), `touch-action: none`. Clavier WASD/flèches + Maj pour courir (`useKeyboardInput`). Entrées suspendues quand une feuille ou un formulaire est ouvert. | spec : 8 angles tenus 1,5 s, course, arrêt sans glissement (vitesse 0, mode `idle`) |
| Animations humaines | Clips Kenney `idle` / `walk` / `sprint` / `sit` (conduite) commutés uniquement au changement d'état ; le corps s'oriente vers le déplacement. | spec : ≥ 4 caps distincts sur 8 directions |
| Collisions | Capsule (rayon 0,28 case) contre les cellules : routes, allée, routes et pelouse du domaine, parcs et terrains libres sont praticables ; bâtiments, eau, collines bloquent ; glissement axe par axe le long des obstacles. | tests unitaires (mur, eau) ; spec : après 6 s de poussée, la case occupée est praticable |
| Caméra suiveuse | Rig troisième personne : cible lissée (exponentielle), distance 12 par défaut (7–110), inclinaison −30° de près à −52° de loin, orbite au glisser horizontal, zoom au glisser vertical / pincement / boutons ; « Vue de la ville » = caméra libre, « Recentrer » = retour au suivi. | spec : caméra à < 3 cases de l'avatar après l'arrêt, `follow` vrai |
| Taxi pilotable | Un taxi du joueur stationné sur l'avenue près du domaine (Lomé). À ≤ 1,8 case : bouton « Monter » ; conduite au joystick (accélération 6 case/s², 9 case/s max, marche arrière, frein, friction, direction proportionnelle à la vitesse), le véhicule reste sur la chaussée (essieux avant/arrière contrôlés), caméra véhicule avec avance, descente seulement à l'arrêt (< 0,6 case/s) sur le trottoir ; un seul avatar (masqué dans la voiture). Position du taxi persistée dans la sauvegarde. | spec : montée, vitesse > 2, freinage, déplacement > 2 cases, descente, mode `idle` |
| Itinéraires automatiques (toucher un lieu) | Conservés : le contrôleur suit la route case après case, à travers les parcs et pelouses (`findPathWhere`), le joystick l'interrompt. | `lome-life`, `lome-travel`, `lome-world-life` verts |
| Une seule scène, aucun `deleteBuffer` | Inchangé (Jalon A/B) ; le spec D1 vérifie un seul canvas et aucune erreur page/WebGL. | `lome-gpu-lifecycle` vert dans la suite |
| Qualité adaptative réaliste | `QualityGovernor` : baisse après 3 contrôles < 24 FPS (9 s), remontée après une minute > 50 FPS, jamais au-dessus du niveau de l'appareil/du joueur, jamais dans la minute suivant une baisse ; plancher 6 FPS conservé pour les rendus logiciels. | tests unitaires |

Captures après : `docs/captures/jalon-d/d1-apres-android.png`, `d1-apres-desktop.png`
(avant : `d0-avant-pad-android.png`, `d0-avant-desktop.png`).

## Mesures après D1 (même protocole que D0 : Chromium headless, SwiftShader, **pas un appareil réel**)

| Scénario | D0 desktop FPS / p50 / p95 | D1 desktop FPS / p50 / p95 | D0 mobile FPS / p50 / p95 | D1 mobile FPS / p50 / p95 | Draw calls D0 → D1 | Triangles D0 → D1 |
|---|---|---|---|---|---|---|
| A ouverture à froid | 3,2 / 299 / 688 | 4,1 / 210 / 402 | 6,5 / 158 / 382 | 8,7 / 108 / 193 | 35 → 23 / 15 → 13 | 990 k → 871 k |
| B Tokoin vue aérienne | 3,5 / 280 / 539 | 4,4 / 205 / 603 | 6,3 / 146 / 293 | 9,1 / 108 / 169 | 38 → 25 / 20 → 13 | 987 k → 872 k |
| C zoom maximal | 5,1 / 191 / 305 | 4,2 / 215 / 447 | 12,0 / 78 / 139 | 9,3 / 105 / 197 | 10 → 19 / 5 → 13 | 984 k → 869 k |
| D caméra en mouvement | 2,3 / 417 / 856 | 2,9 / 307 / 680 | 4,1 / 245 / 362 | 6,2 / 151 / 313 | 68 → 62 / 30 → 28 | 988 k → 874 k |
| E salle de sport | 13,6 / 70 / 104 | 12,4 / 80 / 115 | 21,8 / 45 / 63 | 21,0 / 46 / 73 | 292 → 292 | 15 k → 15 k |
| F retour en ville | 3,1 / 420 / 584 | 3,4 / 128 / 1172 | 4,4 / 233 / 448 | 5,5 / 191 / 354 | 60 → 36 / 34 → 22 | 925 k → 919 k |

Lecture prudente : les écarts viennent surtout du nouveau cadrage (caméra plus proche, moins
de chunks lointains visibles) ; le scénario C (zoom maximal) cadre désormais plus large
qu'avant, d'où son recul. Le volume de géométrie reste le poste dominant (~870 k triangles) :
c'est le prochain chantier D0/D2 (LOD plus agressif des chunks moyens/lointains, instancing des
arbres et lampadaires) avant toute extension. **Aucune mesure sur Android réel n'a pu être
faite depuis cette session** : suivre le protocole de la baseline sur la Motorola.

## Vérification

- Typecheck et lint propres sur les fichiers modifiés ; tests unitaires : 16 + 113 (dont 20 pour
  le contrôleur, le joystick, la caméra et le gouverneur de qualité).
- Suite Lomé complète sur la première build D1 : 26 tests, 22 verts, 4 échecs = les deux anciens
  specs qui cliquaient le pavé 4 directions (`lome-life`, `lome-travel`), réécrits pour le
  déplacement continu ; après reconstruction, `lome-life` + `lome-travel` + `lome-player` + `lome-perf`
  8/8 verts, puis **suite complète 26/26** (desktop + mobile-android, 10,8 min) sur la build committée.

## P0 — rendu PlayCanvas : audit et optimisation de la géométrie

**Audit (hook `__LOME_CHUNKS`, triangles attribués par catégorie et par niveau de détail,
caméra de suivi à 12 cases, Chromium SwiftShader).** Avant : 25 chunks chargés = 835 k
triangles, dont les 9 chunks proches 811 k, et **719 k pour les seuls modèles de bâtiments**
(89 %) ; props 59 k, trottoirs/rues 11 k, mobilier de rue 9 k, sol 3 k ; les 16 chunks lointains
en volumes colorés ne coûtaient que 24 k. Les modèles Kenney pèsent 1 200 à 5 200 triangles
chacun (`com-j` 5 246) alors qu'un lot occupe quelques dizaines de pixels à distance moyenne ; le
frustum ne retirait que 336 k triangles sur 872 k soumis à la caméra proche, et 0 en vue de ville.
Le coût est donc GPU (sommets, remplissage) et mémoire (≈ 1,5 M sommets × 40 octets en chunks
fusionnés), pas les draw calls (26). Les squelettes (5 à 7 animés) et le CPU de construction des
chunks (13 tâches longues au démarrage) viennent ensuite.

**Ce qui a été fait.**

- Sous-chunks de 8 × 8 cases (`SUB`), chacun un maillage fusionné : le culling par frustum
  travaille sur 4 × plus d'unités ; les volumes lointains restent fusionnés par chunk de 16 × 16
  pour limiter les draw calls en altitude.
- Trois niveaux par sous-chunk selon la distance au centre de la caméra : **plein** (modèles
  complets, props, détails), **simplifié** (`lib/haroolife/city/simplify.ts` : regroupement de
  sommets sur une grille de 12 cellules par modèle, environ un cinquième des triangles,
  silhouettes, toits et couleurs conservés, sans petits props), **lointain** (volumes colorés avec
  toit). Rayons par preset : éco 9 / 22 cases, équilibré 13 / 30, élevé 18 / 40.
- Budget de triangles visibles par preset (160 k / 320 k / 650 k) : au-delà, le rayon de détail
  se réduit par paliers ; bien en dessous pendant 8 s, il remonte (hystérésis).
- Cache GPU borné (72 maillages au-delà des vivants, éviction LRU) : un aller-retour ne
  reconstruit rien ; changement de niveau = échange du maillage sur l'entité existante.
- Streaming découpé dans le temps : ≤ 9 ms de construction par tick, les plus proches d'abord,
  la suite à l'image suivante.

**Mesures après (mêmes caméras, même machine, SwiftShader : tendances, pas des FPS Android).**

| Caméra | Visible avant → après (triangles) | Chargé avant → après | FPS desktop avant → après | p50 / p95 desktop | FPS mobile avant → après | p50 / p95 mobile |
|---|---|---|---|---|---|---|
| Suivi à 12 cases (A) | 336 k → 149 k | 835 k → 216 k | 5,3 → 6,1 | 191 / 323 → 154 / 302 | 8,7 → 15,5 | 108 / 193 → 64 / 105 |
| Recul ×3 (B) | 337 k → 161 k | 835 k → 216 k | 5,8 → 7,1 | 177 / 279 → 137 / 265 | 9,1 → 16,5 | 108 / 169 → 60 / 102 |
| Vue de la ville (C) | 871 k → 164 k | 835 k → 127 k | 3,4 → 8,9 | 265 / 745 → 110 / 137 | — → 14,9 | — → 67 / 112 |

Scénarios du spec de performance (`lome-perf`, mêmes caméras A–F qu'au D0) après P0 :
desktop A 5,7 FPS (p50 167, p95 267 ms, 253 k triangles, 35 draw calls, 88 Mo) contre 3,2 FPS
(299 / 688 ms, 990 k, 186 Mo) au D0 ; mobile A 12,5 FPS (77 / 141 ms) contre 6,5 (158 / 382 ms) ;
ville détaillée visible en 1,8–2,6 s contre 5,8–6,6 s ; heap 88–112 Mo contre 108–219 Mo.
Le scénario D (glissement en vue de ville) reste le plus coûteux sur SwiftShader (230 draw calls
avec les sous-chunks avant la fusion des volumes lointains par chunk, livrée juste après).
Fichiers : `docs/captures/jalon-d/p0-audit-*.txt`, `p0-perf-*.json` ; captures
`p0-apres-proche-*.png`, `p0-apres-recul-*.png` (bâtiments proches inchangés, simplifiés au-delà
du rayon de détail, volumes au loin).

**Non vérifié sur Android réel** : les cibles (≥ 30 FPS) restent à confirmer sur le Motorola
avec `scripts/haroolife-lan.sh` et le protocole de la baseline.

## D2 — avatar configurable et animations

| Critère | Réalisation | Preuve |
|---|---|---|
| Avatar configurable, humain, lisible | Feuille « Mon apparence » (journal) : six personnages Kenney Mini Characters (CC0, `public/haroolife/vendor/kenney-3d/mini-characters`), un pagne porté en pagne-wrap aux hanches dans une des huit couleurs ; choix gardé sur l'appareil (`haroolife.avatar.v1`, jamais écrit côté serveur). Le même modèle et le même pagne servent dans la rue, dans les pièces (`InteriorScene`) et au volant : un seul personnage. | `e2e/lome-avatar.spec.ts` (desktop + mobile) ; captures `d2-apparence-*.png`, `d2-marche-*.png` |
| Animations | `idle`, `walk`, `sprint` (course), `drive` au volant, `interact-right` au pas de porte (joué 0,55 s quand l'avatar ressort d'un bâtiment) ; transitions 0,15 s ; cadence du cycle de marche asservie à la vitesse au sol (0,6–1,5 ×) pour limiter le glissement des pieds. **Demi-tour** : le pack ne contient pas de clip de pivot, le personnage tourne sur place à 600°/s avec le clip courant (fallback documenté, pas d'erreur). | spec : clip `walk`/`run` en marche, `idle` à l'arrêt, `enter`/`idle` à la sortie |
| Contact au sol | Origine des modèles Kenney aux pieds ; avatar posé à 0,05 au-dessus du sol du monde ; hauteur du modèle 0,66 u (échelle 1,15). | captures |
| Joystick et caméra persistants | Inchangés (D1). | `lome-player` vert |

Inventaire des assets : seuls les personnages Kenney (CC0) sont utilisés ; aucun asset
propriétaire. Limite : silhouettes « mini » stylisées, pas de visage ni de vêtements
interchangeables — un pack riggé plus réaliste (licence compatible) reste à sourcer pour aller
plus loin.

Régression : suite Lomé complète **28/28** (desktop + Pixel 7, 10,4 min) sur la build P0 + D2,
puis `lome-avatar` 2/2 après le réglage de la taille du pagne.

## Reste à faire (ordre de la mission)

- Performance : LOD des personnages (squelettes), Worker de génération si mesuré, compression des GLB/textures.
- D2 suite : pack de personnages plus réalistes sous licence compatible, clips `turn`/`work`/`carry`, LOD des squelettes.
- D3 : zémidjan (chauffeur/passager) et car interurbain par chunks ; trafic PNJ avec collisions simplifiées.
- D4 agriculture/construction/coopérative/ouvriers/acheteurs en parcours verticaux ; D5 présence temps réel
  (Presence + Broadcast privés) ; D6 déclinaison régionale ; D7 campagne Android réelle et vidéos.
