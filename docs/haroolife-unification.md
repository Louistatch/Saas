# HarooLife — unification nationale (un seul monde 3D)

Document de travail du chantier « un seul jeu national ». Il est tenu à jour à chaque jalon.
Rien n'est poussé, fusionné ni déployé sans accord explicite.

## Contrainte absolue : fidélité à Lomé Life 3D

Le moteur unique est le moteur PlayCanvas de Lomé Life 3D (`components/haroolife/city/*`,
`lib/haroolife/city/*`). Les anciens moteurs (village SVG, cartes 2D, plateau de construction
isométrique) ne remplacent jamais l'expérience : leurs mécaniques sont réintégrées comme des
fonctionnalités internes du même monde 3D. Bâtiments détaillés, densité urbaine, routes,
personnages, véhicules, intérieurs, animations, déplacements et interface immersive sont conservés.
Toute régression visuelle ou fonctionnelle par rapport à Lomé Life fait échouer la validation
(captures avant/après mobile et PC, tests Playwright `e2e/lome-*.spec.ts`).

## Jalon 0 — audit Git (12 octobre 2026)

| Élément | État constaté |
|---|---|
| `origin/main` | `4686128` — fusion de la pile de PR #23 → #29 (Lomé Life 3D, ville 3D, monde vivant, performance, coopératives, agrégation, marché). Production `www.faitierehub.com` déployée depuis ce commit. |
| Branche de travail | `feat/haroolife-national`, créée depuis `origin/main` `4686128`. Travail local uniquement. |
| Routes HarooLife | `/haroolife` (TogoLife : onglets Maison/Village/Carte/Téléphone/Équipes, village SVG), `/haroolife/territoire` (CityBuilder : plateau 2D/3D townsmen), `/haroolife/territoire/lome` (Lomé Life 3D immersive, moteur de référence), `/haroolife/territoire/carte` (bac à sable Leaflet). |
| Applications WebGL | Quatre composants montent chacun leur propre `<Application>` PlayCanvas : `city/city-world.tsx` (Lomé), `city-world-3d.tsx` (HarooVille), `village-3d.tsx`, `territory-world-3d.tsx`. Un seul est monté à la fois par page, mais chaque transition détruit et recrée un contexte WebGL. |
| Sauvegardes locales | `haroolife.lome-city.v1` (Lomé Life 3D), `haroolife.lome-life.v1` (ancien Lomé Life 2D, migré par `fromLegacy`), `haroolife.citybuilder.v1` (HarooVille), `haroolife.groupe`, `haroolife.quality`. |
| Données serveur | `haroolife_residents`, `haroolife_messages`, `haroolife_groups`, `haroolife_participations`, `haroolife_pilot` ; fonctions `haroolife_world`, `haroolife_set_home`, `haroolife_say`, `haroolife_board`, `haroolife_command` ; géographie `regions` → `prefectures` → `cantons` (migration `20260524_full_schema_alignment.sql`). |
| API | `/api/haroolife` (board/command), `/world`, `/home`, `/say`, `/me`, `/market`, `/cooperatives/[id]`, `/cooperatives/[id]/members`. |
| Tests | `e2e/lome-life-playwright.config.ts` : projets `desktop` 1440×900 et `mobile-android` Pixel 7 ; specs city, life, perf, presence, world-life, cooperative, gpu-lifecycle. CI `.github/workflows/haroolife-lome-browser.yml`. |

## Crash Android `Cannot read properties of null (reading 'deleteBuffer')`

**Reproduction.** `e2e/lome-gpu-lifecycle.spec.ts` : dix transitions client Lomé 3D → HarooVille →
Lomé 3D (liens du jeu, puis historique du navigateur, puis mise en arrière-plan simulée), puis
perte et restauration du contexte WebGL (`WEBGL_lose_context`). Avant correction, l'erreur se
produit dès la première transition sur les deux projets (desktop et mobile) et déclenche la page
« Une erreur est survenue ».

**Cause racine** (pile capturée dans le bundle de production) :

```
WebglBuffer.destroy       device.gl.deleteBuffer(...)   gl est déjà null
Material.destroy          this._uniformBuffer.destroy()
StandardMaterial.destroy
useMaterial cleanup       @playcanvas/react/hooks (useLayoutEffect)
React commitDeletionEffects
```

React exécute les nettoyages d'effets de mise en page **du parent vers les enfants** lors d'un
démontage. Le `<Application>` de `@playcanvas/react` détruit l'application et son périphérique
graphique (`WebglGraphicsDevice.destroy()` met `this.gl = null`) avant que les matériaux créés par
`useMaterial` dans les enfants ne soient libérés ; leur tampon d'uniformes appelle alors
`gl.deleteBuffer` sur un contexte mort. Les maillages et entités créés impérativement par nos
composants (chunks, personnages, sol du domaine) suivaient le même chemin.

**Correction** (nettoyage GPU idempotent, sans `try/catch` masquant) :

- `lib/haroolife/city/gpu.ts` : `deviceAlive()`, `releaseMesh()`, `releaseEntity()` — libération
  uniquement si le périphérique possède encore `gl` et son canvas ; après la mort du périphérique,
  tout objet GL a déjà été libéré par `device.destroy()`, la référence est simplement abandonnée.
- `components/haroolife/city/use-material.ts` : remplaçant de `useMaterial` dont le nettoyage est
  gardé par `deviceAlive(app.graphicsDevice)`. Tous les composants 3D (`city/city-world.tsx`,
  `city/interior-scene.tsx`, `city-world-3d.tsx`, `travel-scene-3d.tsx`, `lome-life-room-3d.tsx`)
  l'utilisent désormais ; plus aucun import de `useMaterial` depuis `@playcanvas/react/hooks`.
- `city/city-chunks.tsx`, `city/character.tsx`, `city/city-world.tsx`, `city-world-3d.tsx` :
  destructions de maillages et d'entités via `releaseMesh` / `releaseEntity`.

**Vérification.** `lome-gpu-lifecycle` vert sur `desktop` (1,7 min) et `mobile-android` (1,4 min)
après reconstruction du bundle : 10 transitions, 0 erreur de page, 0 erreur console WebGL,
≤ 1 canvas à tout instant, contexte restauré après perte. Résultat de la suite complète : voir
`docs/haroolife-performance.md` (mis à jour à chaque jalon).

## Matrice de consolidation

Destination = toujours le moteur Lomé Life 3D. « Module » désigne une fonctionnalité interne du
même monde (feuille, panneau ou bâtiment), jamais une page ni une seconde application WebGL.

| Fonctionnalité | Source actuelle | Destination dans le moteur Lomé Life | Données | Test (acceptation) |
|---|---|---|---|---|
| Entrée du jeu | `app/haroolife/page.tsx` → `togo-life.tsx` (village SVG) | `/haroolife` monte directement la scène 3D nationale (`LomeLifeImmersive` étendu) ; `togo-life` retiré de l'entrée | `haroolife_world` (résidence, canton) | S1 : `/haroolife` affiche le monde 3D, aucune page intermédiaire |
| Carte nationale et choix de destination | `togo-map.tsx` (cinq régions), `territory-map.tsx` (Leaflet) | Feuille « Voyager » dans le HUD immersif : régions → préfectures → cantons → villes, puis trajet (`travel-scene-3d`) et chargement par chunks de la localité | `regions`/`prefectures`/`cantons` (Supabase) + frontières sourcées OSM/Geofabrik (ODbL) en pipeline hors ligne | S2–S3 : carte → Lama-Kara/Lomé jouables, aucune ville entière chargée d'un coup |
| Monde urbain de Lomé (quartiers, lagune, plage, routes, trafic, PNJ, intérieurs) | `city/city-world.tsx`, `city/city-chunks.tsx`, `lib/haroolife/city/*` | Inchangé : il devient le pôle « Grand Lomé » du monde national | `haroolife.lome-city.v1` | `lome-city`, `lome-world-life`, `lome-perf` (non-régression) |
| Pôles régionaux (Kpalimé/Atakpamé/Danyi, Sokodé, Kara/Bafilo/Pagouda, Dapaong) | — (n'existe pas) | Mêmes générateurs de chunks paramétrés par un profil régional (palette, matériaux, essences, densité, bâtiments typiques) ; identité visuelle par région sans dégrader le niveau de détail de Lomé | `lib/haroolife/city/regions.ts` (profils) + géographie sourcée | S3 + captures mobile/PC par pôle |
| Construire (HarooVille, townsmen : lots, routes, budget, croissance) | `city-builder.tsx`, `city-world-3d.tsx`, `city-isometric-canvas.tsx`, `lib/haroolife/townsmen-engine.ts` | Module « Construire » sur le domaine du joueur (`ESTATE`) déjà inclus dans le monde Lomé ; `/haroolife/territoire` redirige vers `/haroolife?module=construire` (sans boucle) | `haroolife.citybuilder.v1` migré dans `haroolife.lome-city.v1` (`life.city`) | S4 : construire un bâtiment, recharger, retrouver la construction |
| Maison et pièce du joueur | `home-room.tsx` (isométrique), `lome-life-room-3d.tsx` | Intérieurs 3D existants (`interior-scene.tsx`) | `haroolife.lome-city.v1` | `lome-world-life` (intérieur) |
| Village et habitants réels du canton | `village-iso.tsx`, `village-scene.tsx`, `village-3d.tsx`, `use-presence.ts` | Présence réelle déjà portée dans le quartier 3D (`lome-presence.ts`) ; étendue au canton de résidence | `haroolife_world`, `haroolife_residents` | `lome-presence` |
| Parler sur la place | `togo-life.tsx` (bulles) | Feuille « Messages » du HUD immersif (déjà présente) | `haroolife_messages`, `haroolife_say` | S6 |
| Téléphone (applis partenaires, panneaux) | `togo-life.tsx` onglet Téléphone, `lome-sponsors.ts` | Téléphone immersif déjà en place (tranche 5) | `lome-sponsors.ts` | `lome-life` |
| Équipes, regroupements, marché | `togo-life.tsx` onglet Équipes, `city/aggregation.tsx`, `city/market-panel.tsx` | Panneaux immersifs déjà en place (Jalon 3) | `haroolife_board`, `haroolife_command`, `/api/haroolife/market` | `lome-cooperative` |
| Acteurs Haroo / FaîtiereHub (ouvrier, acheteur, agronome, coopérative, membres) | `city/cooperative-panel.tsx`, `lib/haroolife/domain/*` | Inchangé ; bâtiments de coopérative par localité | RPC existantes, RLS | `lome-cooperative` |
| Territoire agricole (parcelles, logistique) | `territory-sandbox.tsx`, `territory-world-3d.tsx`, `territory-3d-panel.tsx`, `lib/haroolife/territory-*.ts` | Module « Économie » : parcelles et flux logistiques rendus dans le monde 3D autour des localités ; `/haroolife/territoire/carte` redirige | `lib/haroolife/territory-simulation.ts` | S5 |
| Trajet entre lieux | `travel-scene-3d.tsx` (dans Lomé) | Réutilisé pour les voyages interurbains (route nationale, durée réelle, coût) | — | S3 |
| Qualité et performance | `lib/haroolife/city/quality.ts`, `perf.ts` | Inchangé, budgets par région, streaming des chunks à la demande | `haroolife.quality` | `lome-perf`, p50/p95 Android |
| Cycle de vie GPU | 4 `<Application>` distincts | Une seule `<Application>` montée par `/haroolife` ; les modules changent de scène sans démonter le moteur | — | `lome-gpu-lifecycle` (20 transitions mobile sans erreur) |

## Ordre des jalons

A. Audit + crash GPU (fait, voir ci-dessus).
B. Entrée unique `/haroolife` dans le moteur Lomé Life ; `/haroolife/territoire`, `/lome`, `/carte`
   redirigent vers des modules du même monde ; migration des sauvegardes ; une seule application
   PlayCanvas.
C. Carte nationale sourcée + deux pôles pilotes (Grand Lomé, Lama-Kara) avec décor régional et
   chargement progressif par chunks.
D. Intégration complète des mécaniques (Construire, Économie, village, maison, acteurs).
E. Performance Android mesurée (p50/p95, appels de rendu, démarrage, mémoire, pertes de contexte),
   neuf scénarios d'acceptation, captures réelles avant/après mobile et PC.
