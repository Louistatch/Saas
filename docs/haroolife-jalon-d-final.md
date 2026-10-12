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

## Reste à faire (ordre de la mission)

- D0/D2 performance : budget triangles, instancing, LOD personnages, Worker de génération si mesuré.
- D2 avatars : apparence (tenue, couleurs), pipeline rig/animations étendu (`turn`, `work`, `carry`…), LOD.
- D3 : zémidjan (chauffeur/passager) et car interurbain par chunks ; trafic PNJ avec collisions simplifiées.
- D4 agriculture/construction/coopérative/ouvriers/acheteurs en parcours verticaux ; D5 présence temps réel
  (Presence + Broadcast privés) ; D6 déclinaison régionale ; D7 campagne Android réelle et vidéos.
