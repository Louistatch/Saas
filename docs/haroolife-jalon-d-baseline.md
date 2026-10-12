# HarooLife — Jalon D, état de référence (D0)

Mesuré le 12 octobre 2026 sur `feat/haroolife-national` au commit `c5c6bb8` (= `main` après la
PR #30), version de production locale (`next build` + `next start`), avant toute modification du
Jalon D. **Rien n'est poussé ni déployé sans accord explicite.**

## Git

| Élément | État |
|---|---|
| Branche | `feat/haroolife-national`, propre, 3 commits d'unification (db73881, 568a2cd, c5c6bb8) fusionnés dans `main` par la PR #30 (6a0b6f9) |
| Production | www.faitierehub.com déployée depuis 6a0b6f9 (Vercel READY) |
| Tests | unitaires 111/111 ; suite Lomé Playwright 24 tests verts (desktop 1440×900, Pixel 7) |

## Inventaire des modules et de leurs API réelles

| Module | Ce qu'il fait aujourd'hui | Constat pour le Jalon D |
|---|---|---|
| `lome-life-immersive.tsx` | HUD, feuilles, état `CityLife` (React). Déplacement **par cases** : pavé 4 directions (`PAD`) et flèches (`KEYS`) → `stepDir` ; itinéraires automatiques → `walkStep` cadencés par un `setInterval` à l'horloge murale (420 ms/case à pied). Chaque pas est un `setCityLife`, donc un re-rendu de tout l'immersif. | Pas de joystick analogique, pas de position continue ; cap de 8 cases par rattrapage. Caméra `follow` recalculée en React à chaque case (`CAMERA_HOME`). |
| `city/city-world.tsx` | `<Application>` unique (depuis le Jalon B), chunks, `Agents` (positions interpolées en impératif via `useAppEvent('update')`), `PlayerFigure` (Kenney `character-female-a`, anim `walk`/`idle` par prop), `Picker` (glisser = panoramique, pincer = zoom, toucher = case), `StatsProbe` (`__LOME_PERF`), caméra `CityCamera` à inclinaison fixe −52°, position recalculée par rendu React. | L'avatar est placé par props à chaque rendu (`Character` réapplique position/rotation dans un effet sans dépendances). Le drag déplace la caméra, jamais le personnage. |
| `city/character.tsx` | Instancie un glTF Kenney Mini Character, `AnimStateGraph` à états plats (clips : static, idle, walk, sprint, jump, fall, crouch, sit, drive, pick-up, emote-yes/no, holding-*, interact-*, wheelchair-*), transition 0,15 s, gel du squelette hors budget. | Clips `walk`/`sprint`/`drive`/`sit`/`interact` disponibles ; pas de blend de locomotion, pas de `turn`. 267 Ko par personnage. |
| `city/life.ts`, `navigation.ts` | `walkable` = routes de la ville + allée + routes du domaine ; BFS `findPath` ; `stepDir`/`walkStep` entiers. | Collisions implicites par cases uniquement ; parcs et terrains libres non marchables. |
| `city/traffic.ts` | Boucle de circulation et trajets de piétons déterministes. | Véhicules PNJ en `Baked`, non pilotables. `travel-scene-3d` = scène séparée de trajet (overlay), pas de conduite. |
| `city/quality.ts`, `perf.ts` | Presets éco/équilibré/élevé, DPR plafonné, rendu logiciel détecté ; `SLOW_FRAME_FPS = 6` (réaction à la lenteur seulement sous 6 FPS, deux contrôles consécutifs). | Seuil trop permissif : un appareil à 12 FPS n'est jamais abaissé. Pas d'hystérésis de remontée. |
| `city/gpu.ts`, `use-material.ts` | Libération GPU idempotente (Jalon A). | Verrouillé par `e2e/lome-gpu-lifecycle.spec.ts` (10/20 transitions, perte de contexte). |

## Mesures avant modification (production locale)

**Environnement : Chromium headless, SwiftShader (WebGL logiciel, aucun GPU). Ce n'est pas un
appareil réel : les FPS absolus ne sont pas représentatifs d'un Android ; seuls les compteurs
(draw calls, triangles, entités, squelettes, tâches longues, poids transféré) et les
comparaisons avant/après sur la même machine le sont.** Aucun Android réel n'est accessible
depuis cette session : voir le protocole plus bas.

Ouverture à froid : canvas visible 2,1–2,7 s ; ville détaillée 5,8–6,6 s ; **8 746 Ko transférés
en 54 requêtes** (modèles Kenney, bundle PlayCanvas).

| Scénario | desktop FPS / p50 / p95 ms | mobile FPS / p50 / p95 ms | Draw calls | Triangles | Entités | Animés | Long tasks |
|---|---|---|---|---|---|---|---|
| A ouverture à froid | 3,2 / 299 / 688 | 6,5 / 158 / 382 | 35 / 15 | **990 k** | 120 | 5 | 13 / 11 |
| B Tokoin vue aérienne | 3,5 / 280 / 539 | 6,3 / 146 / 293 | 38 / 20 | 987 k | 119 | 5 | 13 / 11 |
| C zoom maximal | 5,1 / 191 / 305 | 12,0 / 78 / 139 | 10 / 5 | 984 k | 118 | 6 | 13 / 11 |
| D caméra en mouvement | 2,3 / 417 / 856 | 4,1 / 245 / 362 | 68 / 30 | 988 k | 119 | 5 | 14 / 12 |
| E salle de sport (intérieur) | 13,6 / 70 / 104 | 21,8 / 45 / 63 | 292 | 15 k | 154 | 7 | 17 / 15 |
| F retour en ville | 3,1 / 420 / 584 | 4,4 / 233 / 448 | 60 / 34 | 925 k | 120 | 7 | 17 / 15 |

Fichiers bruts : `docs/captures/jalon-d/d0-perf-desktop.json`, `d0-perf-mobile-android.json`.
Captures avant : `docs/captures/jalon-d/d0-avant-pad-android.png` (pavé 4 directions),
`d0-avant-desktop.png`.

**Lecture.** Le coût de la ville n'est pas dans les draw calls (35) mais dans le volume de
géométrie soumis : ~990 000 triangles par image en vue standard (chunks fusionnés, trois
anneaux de LOD). C'est le premier suspect sur Android milieu de gamme (vertex/fill), avant les
squelettes (5 à 7 animés). L'intérieur (15 k triangles, 292 draw calls) est au contraire limité
par le nombre d'appels. Les 13 à 17 tâches longues au démarrage correspondent à la construction
des chunks sur le thread principal.

## Bugs et manques reproduits

1. Le déplacement est discret (une case par appui, 420 ms par case) ; aucun contrôle continu.
2. L'avatar tourne par sauts de 90° (cap calculé entre deux cases).
3. La caméra « suit » en recalculant un cadrage par case : pas de lissage, sauts visibles.
4. Pousser contre un bâtiment affiche un message au lieu de glisser le long de l'obstacle.
5. Aucun véhicule pilotable ; le taxi est une scène de trajet.
6. `SLOW_FRAME_FPS = 6` : la qualité ne baisse qu'à moins de 6 FPS.

## Objectifs (cibles, pas résultats)

30 FPS stables visés sur Android milieu de gamme, 60 sur PC ; p95 mobile ≤ 33 ms sur les scènes
courantes ; aucun gel > 500 ms en transition ; commandes sans délai perceptible. Chaque écart
sera documenté avec sa cause dans `docs/haroolife-jalon-d-final.md`.

## Protocole de mesure sur Android réel (Motorola)

1. Connecter le téléphone en USB, activer le débogage USB, ouvrir `chrome://inspect` sur le PC.
2. Ouvrir l'URL de préversion (ou `http://<ip-du-pc>:3000/haroolife` après `npm run build && npm run start -- --hostname 0.0.0.0`).
3. Dans la console distante : `__LOME_PERF_RESET()`, jouer 60 s (marche au joystick dans Tokoin),
   puis `copy(JSON.stringify(__LOME_PERF))` : `frame.p50/p95/p99`, `fps`, `drawCalls`,
   `triangles`, `animated`, `heapMB`, `longTasks`, `pixelRatio`, `resolution`.
4. Répéter : conduite 60 s, intérieur 60 s, voyage Lomé → Kara, écran verrouillé puis repris.
5. Onglet Performance de DevTools pour le thread principal ; onglet Network pour le poids.
6. Consigner les résultats dans `docs/haroolife-jalon-d-final.md` avec le modèle de téléphone,
   la version de Chrome et le réseau.

## Accès depuis le téléphone sur le réseau local (sans déploiement)

```
bash scripts/haroolife-lan.sh
```

Le script construit la version de production et la sert sur toutes les interfaces
(`next start --hostname 0.0.0.0`), puis affiche l'URL à ouvrir sur le Motorola relié au même
Wi-Fi (`http://<ip-du-pc>:3000/haroolife`). Le pare-feu du PC doit laisser passer le port 3000.
Les variables `NEXT_PUBLIC_SUPABASE_*` doivent être celles du projet réel (`.env.local`) pour que
les services Haroo/FaîtiereHub répondent ; la ville 3D fonctionne aussi hors connexion.
