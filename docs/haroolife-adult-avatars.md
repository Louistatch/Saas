> Mise à jour du 16 octobre 2026 : le retrait des minis, leur migration et les nouveaux clips
> articulés sont décrits dans [haroolife-remove-cubic-avatars.md](haroolife-remove-cubic-avatars.md).
> Les mentions de personnages classiques ci-dessous sont historiques.

# HarooLife — personnages adultes, caméra de jeu et intérieurs Three par défaut

Date : 14 octobre 2026. Branche `feat/haroolife-adult-avatars`, à partir de `main` 8c289b6.
Rien n'est fusionné ni déployé : la publication reste une décision distincte.

## Ce qui change pour un joueur

- **Des adultes à la place des mini-personnages.** Quatre personnages Quaternius (CC0) :
  Afi (tenue décontractée), Abra (tenue habillée), Kossi (chemise et pantalon), Koffi (sweat à
  capuche). Le pagne choisi recolore un vêtement du modèle ; peau et cheveux sont recolorés de
  la même façon. Les six mini-personnages Kenney restent disponibles sous « Personnages
  classiques (mini) » et gardent leur bande de pagne.
- **Premier lancement : choisir son personnage.** Sans apparence enregistrée, la feuille « Mon
  apparence » s'ouvre sur un aperçu 3D animé, la grille des adultes et la palette de pagnes ;
  « Commencer » enregistre le choix (`haroolife.avatar.v1`, même forme qu'avant, et le
  drapeau `haroolife.avatar.chosen`). Les appareils qui ont déjà une apparence ne voient rien
  de nouveau au démarrage.
- **Caméra de jeu plus proche.** Distance de suivi 8 (au lieu de 12) et inclinaison d'environ
  40° au-dessus de la rue ; la vue aérienne de la carte garde sa propre distance (100). Les
  boutons +/−, « Recentrer sur moi » et « Vue de la ville » sont inchangés.
- **Intérieurs Three par défaut.** Depuis `/haroolife` sans paramètre, les bâtiments sont
  dessinés par React Three Fiber avec Rapier : on marche dans la pièce, on ne traverse ni les
  murs ni les meubles, on ressort en marchant. La rue reste sur PlayCanvas.
  `?engine=playcanvas` (mémorisé sur l'appareil) ramène aux intérieurs PlayCanvas.
- **Maison plus lisible.** Caméra intérieure rapprochée, lumière hémisphérique plus chaude ;
  la voisine (Abra) est une adulte. Les PNJ qui marchent dans la rue et les intérieurs sont
  des adultes ; ceux qui sont assis, couchés ou au volant gardent les mini-personnages, dont
  les fichiers ont ces clips.

Sauvegardes, boucles de jeu (besoins, salaire, événements), présence, messagerie et
intégrations sont inchangées ; aucune migration.

## Décision de rendu

| Scène | Moteur | Pourquoi |
|---|---|---|
| Rue, trajets, taxi, carte | PlayCanvas | Chunks, LOD, instancing et mesures de performance déjà en place |
| Intérieurs | React Three Fiber + Rapier (défaut) | Déplacement libre, collisions, sortie à pied ; mesuré au jalon J0/J1 |
| Aperçu de l'avatar | React Three Fiber | Même `Character` que les intérieurs, un seul chargement du glTF |

Repli contrôlé : `?engine=playcanvas` dans l'adresse, ou `NEXT_PUBLIC_HAROOLIFE_ENGINE`.
La spec `lome-interior-three.spec.ts` vérifie ce chemin de retour.

## Manifeste des personnages

`lib/haroolife/city/avatar-catalogue.ts` est la seule source, lue par les deux moteurs :

| Champ | Rôle |
|---|---|
| `height` | Hauteur brute du fichier (boîte englobante mesurée) |
| `stature` | Hauteur monde relative à `FIGURE_HEIGHT` (0,66) : adultes 1,2, minis 1 |
| `yaw` | Rotation pour que le modèle regarde dans le même sens que les minis (180° pour Quaternius) |
| `clips` | idle → Idle, walk → Walk, run → Run, work/enter/lift → Interact, talk → Wave |
| `fallback` | `Idle_Neutral` pour sit, rest, drive, pray (pas de clip dédié dans ces fichiers) |
| `pagneMaterials` | Matériau recoloré avec le pagne (Afi `Orange`, Abra `Red`, Kossi `Red_Dark`, Koffi `Purple`) |
| `skin`, `hair` | Matériaux et teintes |

`figureScale(spec, scale)` donne l'échelle à appliquer : chaque personnage mesure la même
hauteur monde quel que soit le fichier, donc portes, chaises et capsules de collision réglées
pour les minis restent justes. `avatarSpec(id)` renvoie le mini par défaut pour un identifiant
inconnu ; les identifiants `character-*` des sauvegardes existantes se chargent sans
changement. `adultFor(id)` ne remplace un mini par un adulte que pour les PNJ qui marchent.

## Fuite de textures d'os corrigée (PlayCanvas 2.23)

Mesurée pendant la validation : chaque personnage adulte monté dans la rue laissait une
texture d'os (15 × 13) sur le périphérique après sa destruction, soit environ 5 textures par
visite de la maison (le joueur et les piétons voisins sont remontés). Cause :
`instantiateRenderEntity` prend deux références sur l'instance de squelette partagée pour
chaque primitive sauf la première d'un nœud à plusieurs primitives (les adultes en ont
quatre, les minis une), et `entity.destroy()` n'en relâche qu'une par primitive. Correction
dans `lib/haroolife/city/gpu.ts` (`releaseSkinnedEntity`) : relâcher les références par la
propriété publique `rootBone` jusqu'à ce que la texture ait quitté le périphérique, puis
détruire l'entité. Avec un moteur corrigé la première passe suffit. Vérifié par
`lome-endurance.spec.ts` (20 visites, textures stables) et un script de diagnostic (textures
« skin » par cycle : 23 → 23, contre 38 → 65 avant).

## Corrections apportées par la CI (webgl-browser sur la PR)

- `lome-life.spec.ts` : l'onglet s'appelle « Aménager » ; à l'intérieur, c'est le canvas
  visible qui est attendu (celui de PlayCanvas est masqué pendant un intérieur Three).
- `lome-realtime.spec.ts` : ses propres contextes de navigateur sont marqués « joueur de
  retour », sinon la feuille du premier lancement prend le clavier d'Ama et son avatar ne bouge
  pas chez Yawa. La vitesse de l'avatar distant est mesurée sur des fenêtres d'au moins 220 ms :
  deux rappels d'animation à 7 ms d'intervalle peuvent encadrer une seule mise à jour du
  moteur après une image longue (rendu logiciel), ce qui lisait un pas normal de 0,5 unité
  comme 80 unités/s. Une téléportation de 20 unités reste détectée (> 14 unités/s sur 220 ms).
- Personnage : l'entité est placée à sa position de départ avant d'être remise au parent, et
  les joueurs distants la posent à la position interpolée du moment dès réception, car un
  modèle adulte peut se charger quelques secondes après la première pose.

## Fichiers

- Modèles : `public/haroolife/vendor/quaternius/{Casual_2,Casual_Hoodie,Women_Casual,Women_Formal}.glb`
  et `LICENSE.txt` (CC0, provenance) ; `public/haroolife/models/CREDITS.md`.
- Manifeste : `lib/haroolife/city/avatar-catalogue.ts` ; `lib/haroolife/city/avatar.ts`
  (liste, défaut `afi`, drapeau « choisi »).
- Rendu : `components/haroolife/engine-three/character.tsx` (Three),
  `components/haroolife/city/character.tsx` (PlayCanvas), `components/haroolife/avatar-preview.tsx`.
- Scènes : `components/haroolife/engine-three/interior-three.tsx`,
  `components/haroolife/city/interior-scene.tsx`, `components/haroolife/city/city-world.tsx`.
- Caméra : `lib/haroolife/city/player.ts` (`FOLLOW_DISTANCE`, `MAP_DISTANCE`, `cameraPitch`).
- GPU : `lib/haroolife/city/gpu.ts` (`releaseSkinnedEntity`).
- Moteur : `lib/haroolife/engine/select.ts` (défaut `three`).
- Interface : `components/haroolife/lome-life-immersive.tsx` (premier lancement, feuille
  « Mon apparence », onglet « Aménager »).
- Tests : `tests/haroolife-avatar.test.ts`, `tests/haroolife-renderer.test.ts`,
  `e2e/lome-avatar.spec.ts`, `e2e/lome-interior-three.spec.ts`, `e2e/lome-test.ts`
  (fixture `returningPlayer`).

## Licences

Quaternius Ultimate Modular Men / Women : CC0 1.0. Fichiers récupérés le 14 octobre 2026
depuis un miroir public (variante optimisée, six clips), servis par ce dépôt, jamais depuis le
miroir. Kenney (Mini Characters, Furniture, Car, City, Nature, Suburban) : CC0 1.0. three,
React Three Fiber, drei : MIT ; Rapier : Apache-2.0.

## Vérification (commandes exécutées, pile locale `next start` + Supabase simulé, Chromium SwiftShader)

| Commande | Résultat |
|---|---|
| `npm run typecheck` | 0 erreur |
| `npm run lint` | 426 erreurs, identiques à `main` 8c289b6 (aucune nouvelle) |
| `npm run test:unit` | 216 tests, 0 échec (dont `haroolife-avatar`, `haroolife-renderer`, `haroolife-player`) |
| `npm run build` | OK |
| `npm run security:check` | les 8 assertions de code passent ; 3 assertions d'environnement échouent faute de secrets locaux (KOBO, Upstash, CARD), comme avant |
| Playwright `lome-avatar`, `lome-door`, `lome-player`, `lome-interior-three`, `lome-travel`, `lome-gpu-lifecycle` (desktop + mobile-android) | 16 passés |
| Playwright `lome-endurance` (desktop) | passé seul (1,0 min) ; en parallèle avec le worker mobile, une fois 289 tampons contre 286 attendus, et sur la CI une fois une tendance de 5 tampons contre 4 (seuils de bruit des chunks de rue ; textures stables) |

Captures `docs/captures/haroolife-adultes/` (avant = `main`, après = cette branche) :
`avant-mobile-rue`, `apres-mobile-rue`, `avant-mobile-maison`, `apres-mobile-maison`,
`apres-mobile-selection` (412 × 915) ; `avant-desktop-rue`, `apres-desktop-rue`,
`avant-desktop-maison`, `apres-desktop-maison` (1440 × 900).

Hauteur du joueur mesurée sur les captures (pixels CSS) :

| Vue | Avant | Après |
|---|---|---|
| Rue, 412 × 915 | 40 | 83 |
| Rue, 1440 × 900 | — | 80 |
| Maison, 412 × 915 | — | 101 |

## Limites

- SwiftShader (rendu logiciel) mesure la justesse, pas la performance d'un téléphone Android :
  le coût des quatre glTF adultes (environ 1,85 unité, squelette complet) sur un appareil bas
  de gamme reste à mesurer sur l'appareil.
- Les fichiers Quaternius n'ont pas de clips assis, couché ni conduite : les adultes prennent
  la pose neutre dans ces situations, et les PNJ assis ou au volant restent des minis.
- Le mobilier des intérieurs (Kenney Furniture Kit) est à l'échelle des minis ; il paraît un
  peu petit à côté d'un adulte. La maquette Figma HarooLife n'est pas intégrée (consigne).
- Pas d'autres lieux meublés ni d'usage nouveau du Car Kit dans cet incrément.
