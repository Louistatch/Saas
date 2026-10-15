# HarooLife V3 — preuves de correction

## Ce qui a été testé

- **Commit testé** : `8d1ecc4` sur la branche `claude/lucid-pascal-fwb714` (base `main` 4d1a6a6).
- **Exécution** : `next start` local en production (`npm run build`), Supabase simulé
  (`e2e/fixtures/mock-supabase.mjs`) et relais temps réel PGlite local. Aucun appel à la
  production, aucun compte réel.
- **Navigateur** : Chromium sans écran avec rendu WebGL logiciel (SwiftShader). Ce n'est pas un
  appareil Android : les images/s ci-dessous ne sont pas celles d'un téléphone.
- **Moteurs** : rue en PlayCanvas, intérieurs en React Three Fiber + Rapier (`three`, par défaut).
- **Assets réellement chargés** :
  - `public/haroolife/city/kenney-pack.{json,bin}` (rebaké avec les kits City Commercial,
    Suburban, Industrial du ZIP V3 et les kits Kenney déjà présents) ;
  - les quatre GLB Quaternius `Women_Casual`, `Women_Formal`, `Casual_2`, `Casual_Hoodie` ;
  - le mobilier Kenney Furniture déjà présent.

## Vu dans le navigateur (captures et vidéos du rendu exécuté)

Les captures sont dans `docs/captures/haroolife-v3/`. Les vidéos (WebM) sont jointes à la PR
plutôt que versionnées.

| Critère | Mesure / preuve | Résultat |
|---|---|---|
| Moonwalk du joueur | Produit scalaire orientation·déplacement sur 10 segments (4 directions, 2 diagonales, 2 demi-tours). Avant −0,7 à −1 (`01-avant-moonwalk.jpg`), après 0,99 à 1 (`02-apres-marche-4-directions.jpg`). Vidéo `afi-walk.webm` avant/après | Corrigé ; retour à l'arrêt (idle) quand le joystick est relâché |
| Marche des PNJ | Piétons de la rue : 8 marcheurs, 640 échantillons, médiane 1, 97,3 % > 0,9. Marcheurs de la salle : 78 échantillons, 97,4 % > 0,9. Plus longue série « à reculons » : 1 échantillon de 100 ms (l'échantillon qui chevauche un demi-tour), jamais une marche arrière soutenue. `12-pnj-mobile.jpg`, vidéo `mobile-npc.webm` | Corrigé |
| Avatar adulte habillé | 4 tenues successives (Kossi, Abra, Koffi, Afi), lecture des matériaux du joueur dans la scène : 9 à 10 matériaux, **aucun** entièrement blanc. `10-tenues-mobile.jpg` | Corrigé |
| Taille de l'avatar | Rue, 412×915 : ≈ 119 px CSS (cible 80–140) | Conforme |
| Maison jouable | Manger, Dormir, Se laver, Toilettes, Se détendre en 412×915 **et** 1440×900 : approche (`goal` = cuisinière, lit, douche, WC, canapé), **rien d'appliqué pendant l'approche**, un seul effet à l'arrivée (ex. faim 75 → 100, vessie 70 → 100), argent inchangé. `04-maison-mobile.jpg`, `05-maison-desktop.jpg`, vidéo `mobile-house.webm` | Conforme |
| Parcours complet | Jeu → mode carte (joystick masqué) → filtre Loisirs → fiche « Salle Fitness Tokoin » → Taxi (−900 FCFA, une fois) → trajet → arrivée → Entrer → Activités → Tapis de course : approche puis course (−500 FCFA, énergie −15, une fois) → Sortir → Carte → Retour au jeu. Même résultat en 1440×900. `06-parcours-mobile.jpg`, `07-parcours-desktop.jpg`, vidéo `mobile-journey.webm` | Conforme, 0 erreur de page |
| Carte distincte | Mode carte séparé ; Noms désactivé par défaut ; 0 chevauchement d'icône mesuré ; « Retour au jeu » rétablit la caméra rapprochée. `08-carte-mobile.jpg` | Conforme |
| Zone industrielle | Entrepôts, hangars, conteneurs près du port ; usine avec silo et cheminée vue de la rue. `13-zone-industrielle-mobile.jpg` | Visible |
| Téléphone | Appareil portrait, grille d'applis ; diagnostic et qualité dans Réglages → Avancé. `09-telephone-mobile.jpg` | Conforme |
| Stabilité | 10 cycles maison ↔ rue : entrée 1,3–1,5 s, sortie 1,4–1,5 s, aucun canvas noir (captures de chaque cycle), entités 483 → ~550 puis stables, tas JS 96–141 Mo sans croissance continue, aucun matériau blanc, 0 erreur | Conforme |
| Joueur caché à la sortie de la maison | Avant : le parc de la parcelle masquait entièrement la figure ; après : découpe des objets entre caméra et joueur. `11-sortie-maison-avant-apres-decoupe.jpg` | Corrigé |

## Vérifié par les tests

- `npm run typecheck` : 0 erreur.
- `npm run test:unit` : tous verts (dont `haroolife-avatar` — rôles des matériaux, yaw 0,
  cadence, `shownModel` — et le nouveau test de l'entrepôt).
- Suite Playwright HarooLife complète (`e2e/lome-life-playwright.config.ts`, desktop 1440×900
  et mobile-android 412×915) : **39 réussis, 0 échec, 3 ignorés** (les trois tests desktop-seulement — console publicitaire, endurance, temps réel — se déclarent `skip` sur le projet mobile).
- Biome : aucune nouvelle erreur par rapport à `main` sur les fichiers modifiés.

## Performance (SwiftShader, `lome-perf`, mobile-android)

| Scénario | Images/s | p95 (ms) | Draw calls | Triangles |
|---|---|---|---|---|
| Ouverture | 14,6 | 112 | 36 | 265k |
| Salle (intérieur Three) | 25,0 | 55 | 45 | 21k |
| Retour en ville | 8,9 | 148 | 36 | 330k |

Ces chiffres viennent d'un rendu logiciel. Je n'ai pas de mesure d'avant comparable dans cette
session, donc ils ne valident pas la fluidité sur un téléphone réel.

## Limites

- Pas de conversation privée entre joueurs, de transfert de monnaie de jeu ni d'invitations
  (le prompt les place après le parcours de base ; ils demandent un contrat serveur).
- Pas de nouvel événement à choix V3.
- Pas de clip assis ou couché pour les adultes : lit et canapé jouent l'animation la plus
  proche, la figure reste à côté du meuble.
- Les PNJ font demi-tour instantanément au bout de leur trajet (pas de rotation progressive).
- Aéroport non recomposé ; Kara sans zone industrielle.
- Aucune mesure sur un vrai téléphone Android.
