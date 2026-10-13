# HarooLife — jalons J0 et J1 du moteur 3D

Date : 13 octobre 2026. Branche `feat/haroolife-engine-r3f`. Rien n'est fusionné ni déployé.
Référence : audit « HarooLife Next-Gen 3D — Audit » (plan J0 → J4).

## Ce qui change pour un joueur

Rien, par défaut : PlayCanvas reste le moteur de toutes les scènes. Avec `?engine=three` dans
l'adresse (choix mémorisé sur l'appareil), les **intérieurs** sont dessinés par React Three
Fiber avec la physique Rapier :

- le joueur marche dans la pièce au joystick ou au clavier, au lieu de rester figé à l'entrée ;
- il ne traverse ni les murs ni les équipements (Rapier, contrôleur de personnage cinématique
  qui glisse le long des obstacles) ;
- il sort en marchant par un des deux côtés ouverts de la coupe (le bouton « Sortir » reste) ;
- mêmes personnages, mêmes activités (tapis, banc…), mêmes actions de jeu et sauvegardes.

`?engine=playcanvas` revient en arrière immédiatement ; aucune donnée ne dépend du moteur.

## J0 — socle commun

| Élément | Fichier |
|---|---|
| Contrat jeu ↔ moteur (`InteriorViewProps`, `SceneProbe`) | `lib/haroolife/engine/types.ts` |
| Choix du moteur (`?engine=`, mémoire locale, `NEXT_PUBLIC_HAROOLIFE_ENGINE`) | `lib/haroolife/engine/select.ts` |
| Vue neutre de la scène pour les tests (`window.__LOME_SCENE`) | `components/haroolife/city/scene-probe.ts` (PlayCanvas), `components/haroolife/engine-three/probe.tsx` (R3F) |
| Formes des équipements en données, partagées par les deux moteurs | `lib/haroolife/city/prop-shapes.ts` |
| Licences CC0 dans les dossiers Kenney | `public/haroolife/vendor/*/LICENSE.txt` |

Les 6 specs qui lisaient l'objet PlayCanvas lui-même (`__LOME_APP` : recherche par nom,
mémoire GPU, position) lisent maintenant `__LOME_SCENE`. `__LOME_APP` reste exposé pour le
débogage. L'intérieur PlayCanvas dessine désormais à partir de `prop-shapes.ts` : mêmes
primitives, mêmes positions, mêmes matériaux qu'avant.

zustand n'a pas été ajouté : l'état de simulation vit déjà hors des composants 3D
(`PlayerController`, objet `input` partagé), ce que recommandent les skills étudiés. Il sera
introduit quand un état devra être partagé entre plusieurs scènes R3F.

## J1 — intérieurs React Three Fiber + Rapier

`components/haroolife/engine-three/` :

- `interior-three.tsx` : la pièce. Toute la géométrie statique (sol, murs, équipements,
  meubles Kenney) est fusionnée en un maillage par matériau. Collisions : sol, deux murs, une
  boîte par équipement (empreinte des primitives, ou boîte englobante du modèle chargé). Les
  tapis et paillassons restent franchissables.
- `character.tsx` : personnage Kenney rigged, `SkeletonUtils.clone` par instance,
  `AnimationMixer` avec fondus de 150 ms, mêmes clips que PlayCanvas, pagne, ombre de contact.
- `probe.tsx` : `__LOME_SCENE` et `__LOME_PERF` au même format que PlayCanvas.

Pendant un intérieur R3F, PlayCanvas arrête de rendre et masque son canvas (il garde la ville
chargée : le retour dans la rue est immédiat). Masquer le canvas a été mesuré utile : environ
un quart du temps de trame en rendu logiciel partait dans la composition de deux canvas plein
écran. Arrêter aussi la boucle PlayCanvas n'a rien changé de mesurable.

Versions épinglées : three 0.186.1, @react-three/fiber 9.8.1, @react-three/drei 10.7.9,
@react-three/rapier 2.2.0 (Rapier 0.19.2). Licences : MIT (three, R3F, drei, wrapper Rapier),
Apache-2.0 (Rapier).

### Changements hors HarooLife, nécessaires

- **CSP** : `'wasm-unsafe-eval'` ajouté sur les routes `/haroolife` uniquement. Sans lui, le
  navigateur refuse de compiler le WebAssembly de Rapier (erreur constatée). Cette directive
  n'autorise pas `eval()` ; le reste du site garde la politique actuelle (vérifié par en-têtes).
- **Types** : R3F ajoute ses éléments au JSX global, ce qui rendait inutilisable le type
  `React.ElementType` pour 4 propriétés d'icônes (tableau de bord, académie, activation de
  couche, carte de graphique). Elles sont typées `LucideIcon`, ce qu'elles étaient de fait.

### Poids (build de production, gzip)

| Morceau | Poids | Chargé |
|---|---|---|
| three + R3F + drei (partie utilisée) | 267 Ko | seulement avec `?engine=three`, à l'entrée d'un intérieur |
| Rapier (WASM inclus en base64 par `@react-three/rapier`) | 815 Ko | idem |

Aucun des deux n'est dans le manifeste initial de la page de Lomé (vérifié). Le WASM séparé
de Rapier ferait 569 Ko, mais `@react-three/rapier` impose la version « compat » qui l'inclut :
à revoir avant toute bascule par défaut.

## Validation

| Contrôle | Résultat |
|---|---|
| Typecheck | 0 erreur |
| Biome | aucune nouvelle erreur (comparé fichier par fichier à `main`) |
| Tests unitaires | 182 / 182 (dont 9 nouveaux : choix du moteur, formes partagées) |
| Suite Lomé complète, bureau + Android, moteur par défaut | 39 réussis, 3 ignorés, 0 échec |
| Spec `lome-interior-three` (bureau + Android) | marche, collisions murs, tapis de course, sortie, 3 visites sans croissance des ressources GPU, retour à PlayCanvas |

## Mesures comparées (salle de sport)

(Mesure A/B répétée en cours : résultats dans le commit suivant.)

Toutes ces mesures sont faites **sans GPU** (Chromium + SwiftShader, rendu logiciel). Le profil
CPU de l'intérieur R3F montre le fil principal inactif 87 % du temps : la limite est la
rastérisation logicielle, pas le JavaScript. Ces chiffres comparent les deux moteurs entre eux
dans cet environnement ; ils ne disent rien de la fluidité sur un téléphone.

## Condition de passage J1 → J2 : mesure sur le Motorola

À faire par vous, avec le script existant (`scripts/haroolife-lan.ps1`, même Wi-Fi) :

1. Ouvrir `http://<ip-du-pc>:3000/haroolife?diag=1`, aller à la Salle Fitness Tokoin, entrer,
   attendre 10 s, noter images/s et p95 du diagnostic.
2. Recommencer avec `?engine=three&diag=1`.
3. Remettre `?engine=playcanvas` à la fin.

Le plan prévoit : R3F au moins égal à PlayCanvas sur le Motorola pour continuer avec R3F ;
sinon J2 et J3 se font sur PlayCanvas.

## Limites

- Seuls les intérieurs existent en R3F ; la rue, le taxi et le trajet restent PlayCanvas.
- Pendant un intérieur R3F, deux contextes WebGL coexistent (PlayCanvas en pause garde le
  sien). Sur un téléphone à mémoire faible, c'est un risque à mesurer.
- Les personnages sont toujours les Kenney (J2 : avatars humains).
- La caméra de l'intérieur suit le joueur mais ne se tourne pas au doigt (le bouton de
  rotation agit sur l'angle de la rue, repris à l'entrée).
