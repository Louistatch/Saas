# HarooLife — jalon J2 : avatars humains

Date : 14 octobre 2026. Branche `feat/haroolife-j2-avatars` (à partir de `main` 8212af2).
Rien n'est fusionné ni déployé. Suite de `docs/haroolife-engine-j0-j1.md`.

## Ce qui change pour un joueur

Dans « Mon apparence », quatre **personnes adultes** (Ama, Komlan, Edem, Sena) s'ajoutent
aux six figurines Kenney. Le personnage choisi marche, court, s'assied, parle, passe les
portes et conduit dans la rue, dans les bâtiments (PlayCanvas comme React Three Fiber) et au
volant, à la même taille que les figurines : rues, portes et meubles n'ont pas bougé. Les
humains portent leurs propres vêtements ; le pagne habille toujours les figurines. Les
figurines restent le choix par défaut ; aucune sauvegarde ne change.

Les autres joueurs connectés sont toujours dessinés en figurines, quel que soit leur choix :
un avatar humain pèse 1,6 à 2,3 Mo, seul celui du joueur vaut ce téléchargement sur un
téléphone.

## Source des avatars et licence

**Microsoft Rocketbox Avatar Library** — https://github.com/microsoft/Microsoft-Rocketbox,
licence **MIT** (copyright 2020 Microsoft) : usage commercial et redistribution autorisés, avis
de licence à conserver (`public/haroolife/vendor/rocketbox/LICENSE.txt`). Personnes génériques
de la bibliothèque, ne représentant personne de réel ; aucun modèle généré par IA, aucun robot.
Les écarts de la bibliothèque : 115 avatars dont peu à traits africains ; les quatre retenus
l'ont été à l'œil sur les textures (`Male_Adult_04`, `_12`, `_18`, `Female_Party_02`).

Pistes écartées : ReadyPlayerMe (conditions d'usage non libres, service en ligne), Mixamo
(redistribution des modèles interdite hors d'un projet Adobe), personnages générés (interdits
par le brief).

## Chaîne de fabrication (`scripts/haroolife-bake-avatars.mjs`)

Outil de développement, lancé à la main ; la sortie est versionnée, rien ne tourne au build.

1. FBX → glTF-binaire par **FBX2glTF** 0.9.7 (avatar et chacun des 14 clips).
2. Textures TGA 2048² → JPEG 1024² (couleur, normales) et PNG 512² (cheveux, alpha en
   découpe `MASK`), via ImageMagick.
3. Les 14 clips sont recopiés dans le document de l'avatar et **reciblés par nom d'os**
   (squelette Biped identique, 80 os). Le déplacement horizontal de la racine `Bip01` est
   supprimé : le jeu déplace lui-même le corps (clips `walk`, `run`, `turn`, `sit` pris dans les
   variantes « xy » / « xyz » de la bibliothèque, les autres dans « static »).
4. Les clips conversationnels et assis (30 à 40 s dans la bibliothèque) sont coupés à **8 s**
   : 2,7 Mo d'animation par avatar → moins de 1 Mo.
5. Les couleurs de sommet FBX sont retirées (three.js les multiplie dans la couleur de base).
6. gltf-transform : `resample`, `dedup`, `prune`, `quantize` (KHR_mesh_quantization, lu
   nativement par PlayCanvas et three.js).

| Avatar | Fichier | Poids | Triangles | Os | Textures |
|---|---|---|---|---|---|
| Komlan | `rb-male-04.glb` | 2 064 Ko | 8 684 | 80 | 5 |
| Edem | `rb-male-12.glb` | 1 744 Ko | 6 722 | 80 | 4 |
| Sena | `rb-male-18.glb` | 1 556 Ko | 6 434 | 80 | 4 |
| Ama | `rb-female-party-02.glb` | 2 280 Ko | 9 874 | 80 | 5 |

Clips par avatar : idle, walk, run, turn-left, turn-right, sit-down, sit, stand-up, talk,
listen, wave, door, phone-talk, phone-text (les quatre premiers et `sit`, `talk`, `listen`,
`phone-*` bouclent ; les autres se jouent une fois et tiennent la dernière image). Le jeu
utilise aujourd'hui idle, walk, run, sit, talk, door et phone-text ; les autres sont prêts
pour J3 (demi-tours, s'asseoir / se lever, saluer).

Une figurine Kenney fait 690 à 876 triangles : un humain coûte 8 à 14 fois plus de
géométrie, pour un seul personnage à l'écran (le joueur). Les PNJ restent Kenney.

## Code

| Élément | Fichier |
|---|---|
| Catalogue des figures : fichier, taille, clip par activité, pagne, clips « une fois » | `lib/haroolife/city/avatar-catalog.ts` |
| Liste du choix (dix figures, `kind`) | `lib/haroolife/city/avatar.ts` |
| Personnage PlayCanvas : lit le catalogue, met à l'échelle (0,66 / 1,87), boucle ou non par clip | `components/haroolife/city/character.tsx` |
| Personnage React Three Fiber : idem, `LoopOnce` + `clampWhenFinished` pour les clips « une fois » | `components/haroolife/engine-three/character.tsx` |
| Autres joueurs : figurines seulement | `components/haroolife/city/remote-players.tsx` |
| Choix dans le jeu (« Humain · » / « Figurine · ») | `components/haroolife/lome-life-immersive.tsx` |

Les appelants (`scale={1.15}` du joueur, `0.95` des PNJ…) ne changent pas : le composant
multiplie l'échelle par `0,66 / hauteur du modèle`.

### Deux corrections trouvées par les tests

- **Figure placée à l'origine après un changement de modèle** (PlayCanvas). L'entité est
  recréée quand le modèle change, mais le rig impératif ne la déplaçait qu'au premier pas :
  la nouvelle figure apparaissait au centre du monde jusque-là. Elle est maintenant placée à sa
  création. Le bug existait déjà avec deux figurines Kenney ; il ne se voyait pas dans le test
  D2 qui ne lisait pas la position.
- **Textures blanches dans les intérieurs R3F** (`docs/captures/j2/ama-interieur-r3f-avant-csp-zoom.png`).
  three.js lit les textures incorporées à un GLB par des URL `blob:` (fetch), que la CSP
  refusait (`connect-src`). `blob:` est ajouté à `connect-src` **sur les routes `/haroolife`
  seulement** (même mécanisme que `'wasm-unsafe-eval'` en J1 ; vérifié par en-têtes : la
  racine du site garde la politique stricte). Les figurines Kenney n'étaient pas touchées : leurs
  textures sont des fichiers séparés.

## Validation

| Contrôle | Résultat |
|---|---|
| Typecheck | 0 erreur |
| Biome | aucune nouvelle alerte (comparé fichier par fichier à `main`) |
| Tests unitaires | 185 / 185 (3 nouveaux : catalogue complet, échelle, fichiers et licences présents, poids < 2,5 Mo) |
| `lome-avatar.spec.ts` (bureau + Android) | figurine Kenney (D2) et humain (J2) : choix, 8 684 triangles sous « Joueur », pas de pagne, position conservée au changement, marche, persistance après rechargement |
| `lome-interior-three.spec.ts` (bureau + Android) | inchangé, vert |
| Suite Lomé complète, bureau + Android, moteur par défaut | 41 réussis, 3 ignorés, 0 échec (14,9 min) |

Captures (Chromium + SwiftShader, profil Pixel 7, `docs/captures/j2/`) :

- `komlan-rue-android.png`, `komlan-marche-zoom.png` : Komlan dans la rue (PlayCanvas), de
  face en marchant vers la caméra — le sens de marche des clips Rocketbox (+Z) est celui du
  jeu, aucune rotation à ajouter.
- `ama-interieur-r3f-android.png`, `ama-interieur-r3f-zoom.png` : Ama dans un immeuble
  dessiné par R3F + Rapier, textures lues.

Ces captures sont en rendu logiciel à demi-résolution : elles vérifient la présence, l'échelle,
l'orientation et les textures, pas la qualité visuelle finale. **La qualité et la fluidité sur
téléphone restent à mesurer par vous sur le Motorola** (même protocole qu'en J1,
`scripts/haroolife-lan.ps1`), avec un avatar humain choisi puis une figurine.

## Limites et suite (J3)

- Un seul humain à l'écran (le joueur) ; les PNJ et les autres joueurs restent des figurines.
  Passer les PNJ en humains demande un budget par appareil (LOW : figurines partout).
- Aucun LOD sur les humains : 6 400 à 9 900 triangles à toute distance. À faire avec le
  budget J3 (gltf-transform `simplify`).
- Les clips demi-tour, s'asseoir / se lever, saluer sont dans les fichiers mais pas encore
  joués : la machine d'état du joueur (D1) pivote toujours sur place.
- Le choix reste local à l'appareil, comme en D2.
