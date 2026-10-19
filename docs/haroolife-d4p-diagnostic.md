# HarooLife D4+ — M0 : « je ne peux pas entrer dans ma maison depuis mon téléphone »

Branche locale `feat/haroolife-d4p`, partie de `main` à `e966467` (PR #31 fusionnée). Aucun push, aucun déploiement.

## Reproduction (avant correction)

Build de production local, Chromium (SwiftShader), profil Pixel 7 (412 × 915, tactile), joystick piloté par de vrais évènements tactiles CDP en boucle fermée sur la pose de l'avatar.

| Cas | Parcours | Résultat avant |
|---|---|---|
| A | « Mon foyer » → « Rentrer chez moi » → « Entrer » | Entre (la route se termine sur le seul carreau qui marche) |
| B | Après A, quelques pas sur la pelouse → « Entrer » | Entre, mais **par hasard** : position mémorisée périmée |
| C | Partie neuve, joystick à travers la pelouse jusqu'au mur ouest de la maison → « Entrer » | **Refusé** : « Approche-toi de la porte d'un bâtiment accessible. » |
| D | Partie neuve, sur la pelouse → « Rentrer chez moi » | **Refusé** : « Lieu inaccessible : il faut le relier aux routes de la mairie. » |

Captures authentiques : `docs/captures/d4p/before/` (C-beside-house.png, C-after-enter.png : avatar collé à la maison, message de refus).

Trace du cas C (anonyme, sans secret) :

```
pose avatar   x=57.22 z=30.95   cellule (57,31)   mode idle
CityLife.at   (57,31)            life.pos (11,12)  life.target null   insideLot null
maison        bâtiment (9,9) du domaine = cellule monde (58,31), distance au mur 0,22 cellule
interact('enter') → manhattan(life.pos, maison) = 5 ≠ 1 → refus
```

## Cause racine (prouvée)

1. **Deux positions incohérentes.** Le contrôleur continu (D1) place l'avatar en flottants partout où l'on peut marcher, pelouse comprise. L'ancien moteur du domaine décide de l'entrée avec `life.pos`, qui ne suit l'avatar **que sur les carreaux de route** (`syncEstate`). Sur la pelouse, `life.pos` reste figé sur la dernière route visitée, ou sur la position de départ (11,12) d'une partie neuve.
2. **Règle « porte » par cellule.** `interact('enter')` exige une distance de Manhattan de 1 entre `life.pos` et le bâtiment. Sur les quatre côtés de la maison, seul le carreau de route au sud satisfait la règle. Le joystick amène naturellement l'avatar sur la pelouse ouest, est ou nord : refus.
3. **« Rentrer chez moi » ne planifiait que sur les routes.** Depuis la pelouse, aucun chemin « route seulement » n'existe : refus. De plus `syncEstate` effaçait la maison choisie (`life.target`) à chaque pas, si bien qu'à l'arrivée le puits voisin, qui touche la même route, pouvait passer avant la maison.

Le cas B montre l'effet inverse : la position périmée laisse parfois entrer de loin. Le comportement dépendait de l'historique, pas de l'endroit où se tient l'avatar.

## Correction

- `lib/haroolife/city/interaction.ts` : **un seul résolveur** `resolveInteraction` et un contrat `InteractionTarget { id, kind, locality, label, worldPosition, entrancePosition, distance, radius, isAccessible, reason, action }`. Il lit **la position continue du contrôleur** et mesure la distance euclidienne à l'emprise du bâtiment (ou à sa cellule de porte pour les lieux de la ville). Les cellules ne servent qu'à retrouver les bâtiments voisins.
  - Rayon d'entrée 1,0 cellule (toute la cellule adjacente, comme l'ancienne règle à 0,49 / 0,51), **hystérésis** : la cible affichée reste jusqu'à 1,35 cellule, pas de clignotement.
  - Priorité : bâtiment choisi (« Rentrer chez moi », lieu sélectionné), puis cible déjà affichée, puis le plus proche, départagé par l'orientation de l'avatar. Bâtiment fermé : bouton « Fermé » et raison explicite.
- `enterBuilding` (domaine) et `enterLot` (ville) entrent dans le bâtiment résolu, sans dépendre de `life.pos`. La pose devant la porte est enregistrée à l'entrée.
- `syncEstate` garde la maison choisie pendant un trajet ; `goToEstate` planifie aussi sur la pelouse et préfère la porte côté route.
- HUD : le bouton n'apparaît que devant une entrée, avec le nom du lieu (« Entrer — Maison », « Sortir — Maison »), 56 px de haut, au-dessus du joystick, dans la zone sûre. Touche **E** sur PC. Aucun bouton en conduisant le taxi (« Descends du taxi pour entrer »).
- La résolution tourne environ 7 fois par seconde sur la pose du contrôleur et ne met l'état React à jour que lorsque la porte change : aucun rendu React à 60 Hz.

## Vérification

| Contrôle | Résultat |
|---|---|
| Tests unitaires du résolveur (`tests/haroolife-interaction.test.ts`) | 10/10, dont le cas C qui échouait, 0,49 / 0,51 cellule, hystérésis, priorité, « Rentrer chez moi » depuis la pelouse |
| `e2e/lome-door.spec.ts` sur l'ancien build | **échoue** (bouton absent devant la maison) |
| `e2e/lome-door.spec.ts` sur le nouveau build | **passe** desktop et Pixel 7 émulé : pelouse → Entrer → Sortir ×5 au même endroit (< 0,3 cellule), feuille ouverte/fermée, « Rentrer chez moi », rechargement à l'intérieur, taxi puis retour, touche E, 1 canvas, 0 erreur JS, 0 perte de contexte WebGL |
| Suite Lomé complète (15 scénarios × 2 profils) | **30/30** sur le build corrigé |

Captures après : `docs/captures/d4p/after/` (door-west-lawn-*, door-inside-*).

## Statuts

| Statut | État |
|---|---|
| Implémenté | Oui |
| Test desktop | Oui (Chromium, SwiftShader) |
| Test mobile simulé | Oui (profil Pixel 7, tactile CDP) |
| Test Android réel | **Non testé** : aucun téléphone accessible depuis cette session. Protocole : `scripts/haroolife-lan.sh` puis le parcours de `docs/haroolife-d4p-qa.md`. |
| Test déploiement | **Non testé** : pas de preview publiée (accord requis). |
