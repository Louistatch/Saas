# Audit Three.js HarooLife — 17 octobre 2026

Périmètre : `street-world.ts`, `city-models.ts`, `quality.ts`,
`lome-life-immersive.tsx`, limites React du moteur, circulation et collisions.
Architecture conservée : Three.js impératif, PlayerController, données de ville, règles de
jeu et relais multijoueur existants. Aucun changement de schéma Supabase ni de sauvegarde.

## Protocole et limites

Référence : `main` à `78fa36c6`, avec uniquement la sonde CPU/génération et le scénario de
mesure ajoutés. Comparaison dans le build Next.js de production, même machine, Chromium et
SwiftShader. PC : 1440×900, qualité Élevé, CPU ×1. Android simulé : 412×915, qualité
Équilibré, CPU ×4. Même sauvegarde initiale, heure 14 h, caméra de suivi et ratio logiciel
0,5. La qualité adaptative est verrouillée **uniquement pendant la mesure**, par
`window.__LOME_PERF_LOCK_QUALITY`, pour comparer les mêmes réglages. Le jeu ordinaire
conserve son gouverneur adaptatif.

Deux fenêtres de 12 secondes, après stabilisation : arrêt puis touche Flèche Haut maintenue.
Les collisions restent actives : une marche bloquée n'est pas une traversée artificielle des
bâtiments. Le mouvement reste celui de PlayerController, pas une téléportation de caméra.
Les échantillons sont dans [captures/engine-performance](captures/engine-performance).

- FPS et p95 inter-images : horloge `performance.now()` entre images réellement dessinées.
- p95 CPU : travail de la boucle et soumission WebGL. Le temps CPU de `renderer.render()`
  **n'est pas** un temps GPU. La sonde expose les deux histogrammes séparément.
- Appels et triangles : `renderer.info.render`, image du dernier instantané. En Équilibré,
  une image avec ombres peut compter davantage qu'une image sans rafraîchissement d'ombres.
  Ce ne sont pas des moyennes sur toute la fenêtre.
- Allocations : échantillonnage CDP HeapProfiler à 32 Kio, incluant les objets collectés par
  les GC mineurs/majeurs. Estimation du débit JS, pas comptage exact de toutes les allocations.
- Mémoire : `Runtime.getHeapUsage` avant/après GC forcé, avec stockage des ArrayBuffers
  séparé dans les JSON. Ce n'est pas la VRAM ni la mémoire totale d'un téléphone.
- Génération : temps CPU par tuile, nombre et cumul, incluant les premières simplifications
  de modèles. Une tuile est indivisible : le budget de 2–4 ms est une échéance souple, pas
  une garantie qu'une première génération ne dépassera jamais ce délai.

**Ce serveur ne dispose pas de GPU matériel. Ces FPS ne prédisent ni ceux d'un PC équipé
d'une carte graphique ni ceux d'un téléphone Android réel. Une validation sur appareil reste
nécessaire, en particulier pour la régularité p95 et la chauffe.**

## Mesures avant → après

| Profil / situation | FPS | p95 inter-images ms | p95 boucle CPU ms | p95 soumission WebGL ms | Appels (instantané) | Triangles (instantané) | Allocations JS estimées Mio/s |
|---|---:|---:|---:|---:|---:|---:|---:|
| desktop / arrêt | 4.32 → 5.10 | 283.3 → 341.8 | 9.8 → 6.1 | 8.3 → 5.6 | 300 → 118 | 360051 → 260747 | 2.43 → 1.28 |
| desktop / marche | 4.02 → 4.35 | 285.7 → 286.6 | 21.5 → 9.5 | 19.7 → 8.2 | 272 → 186 | 357027 → 306315 | 2.67 → 1.54 |
| mobile-android / arrêt | 5.86 → 6.66 | 226.3 → 209.0 | 48.0 → 30.2 | 36.9 → 29.3 | 143 → 134 | 178084 → 273796 | 2.76 → 1.29 |
| mobile-android / marche | 5.50 → 5.84 | 249.7 → 227.9 | 47.5 → 45.5 | 36.4 → 39.3 | 135 → 96 | 172135 → 149297 | 2.83 → 1.55 |

| Profil | Générations initiales | Cumul CPU génération ms | p95 par tuile ms | 9 tuiles prêtes ms | Tas JS après GC (arrêt), Mio | Stockage hors tas (arrêt), Mio |
|---|---:|---:|---:|---:|---:|---:|
| desktop | 32 → 16 | 164.9 → 95.7 | 17.3 → 20.8 | 3335 → 3853 | 22.21 → 22.02 | 33.62 → 34.20 |
| mobile-android | 32 → 16 | 677.7 → 316.8 | 66.0 → 70.0 | 6020 → 6349 | 22.41 → 22.37 | 33.81 → 34.20 |

À l’arrêt, aucun nouveau plan de quartier ni bâtiment pendant la fenêtre « après ».
Le cumul de génération diminue ; le p95 par tuile reste irrégulier et ne progresse pas
systématiquement (16 premières générations contre 32 auparavant, dont 16 répétitions déjà
chauffées). Le chargement progressif prend davantage de temps pour afficher neuf tuiles sur
ce GPU logiciel lent : il laisse la boucle et les commandes fonctionner entre les tuiles.
Les buffers de recherche de chemins ajoutent un petit stockage permanent en échange de
moins de recherches et de déchets temporaires.

Les p95 inter-images ne progressent pas dans tous les scénarios de ce banc. Les gains CPU,
d’allocations et d’appels ne constituent donc pas une validation de fluidité sur Android
matériel. Ne pas annoncer « 30 FPS garantis » à partir de ces résultats.

## Corrections

1. **Streaming** : plan des tuiles recalculé au changement de cellule, de qualité ou de
   constructions. À l'arrêt, la file vide ne rescane plus les quartiers, ne trie plus les
   distances et ne reconstruit plus de tableaux de candidats. Priorité aux tuiles proches,
   une génération au plus par image, dès le démarrage. L'ancien chargement initial sans
   limite et la seconde génération identique déclenchée par React sont supprimés.
   Une construction ne régénère que les tuiles du domaine : les anciens maillages restent
   visibles jusqu'à leur remplacement, sans vider les quartiers voisins.
2. **Bâtiments** : mêmes modèles, accessoires, couleurs, normales et dimensions. Les grandes
   listes JS extensibles sont remplacées par des buffers typés alloués à leur taille exacte.
   La géométrie statique ne recalcule plus ses matrices locales à chaque image.
3. **Caches** : variantes proche/lointaine des tuiles réutilisées dans un LRU borné en octets
   et en nombre. Limites de géométrie inactive : 6/9/12 Mio. Les éléments actifs ne sont
   jamais supprimés pour respecter ce budget. Banque de modèles et animations partagées
   conservées ; modèles de circulation fusionnés une seule fois par type. Les téléchargements
   GLB qui terminent après la destruction de la rue libèrent leurs ressources.
4. **Véhicules** : sous-maillages des voitures et motos de circulation fusionnés par matériau,
   sans décimation, avec UV, textures, normales, transformations et propriétés d'ombres.
   Les roues du joueur et des véhicules distants restent indépendantes et animables.
5. **Taxi** : taxi du joueur, des autres joueurs et de circulation utilisent les mêmes facteurs
   d'échelle : 0,78 pour le modèle et 0,67 pour la largeur de voie. Environ
   0,804 × 0,743 × 2,102 unités, à orientation nulle. Collision du taxi ajustée à cette taille,
   marge conservée. Le modèle de secours respecte aussi ces dimensions.
6. **Personnages** : volume de visibilité conservateur englobant le corps et ses animations ;
   seuls les éléments visuels hors champ sont masqués. Les racines, trajets, présences et
   collisions restent actifs. Classement de proximité à 4 Hz pour les animations ; joueurs
   proches et personnage local à pleine cadence, personnages éloignés visibles à 15 Hz,
   temps accumulé transmis au mixer. Un passager caché dans un taxi ne dépense plus un
   squelette animé par image.
   Enveloppes de tri pré-calculées : Three.js ne parcourt plus tous les sommets et poids
   osseux à la première apparition de chaque sous-maillage de personnage. Le profil
   d'allocations avait identifié ce poste (`applyBoneTransform`). Les rigs restent inchangés.
7. **Qualité** : DPR, ombres, streaming, budget d'animations et cache reliés au moteur en place.
   Le DPR respecte désormais le ratio natif de l'écran. Les anciennes clés inutilisées du
   moteur retiré (lumière supplémentaire, volumes lointains, budget de triangles prétendument
   appliqué) sont retirées des presets ; aucune option de jeu fonctionnelle n'est supprimée.
   Le rayon de détail existant de huit cellules reste identique dans les trois qualités.
   La cadence des ombres Équilibré possède son propre compteur : le rafraîchissement des
   statistiques FPS ne réinitialise plus le cycle d'une image sur trois.
8. **WebGL** : changer de qualité ne détruit plus le moteur, ses téléchargements, personnages
   et bâtiments. La carte conserve la rue masquée et suspend sa boucle ; le retour réutilise
   le même canvas et renderer. Les intérieurs continuent de libérer la rue afin de ne pas
   conserver deux mondes 3D complets en mémoire sur mobile. Dans une pièce, le changement
   de DPR ne recharge plus la pièce.
9. **DOM/CPU** : position et visibilité des bulles écrites seulement lorsqu'elles changent ;
   pas de nouvelle transformation pour une bulle hors champ. Projection de caméra recalculée
   lorsque sa position, son angle, son zoom ou la taille du canvas changent. Liste des routes
   du quartier mise en cache. Corps de collision et listes de proximité réutilisés.
10. **Collisions** : même test des quatre axes séparateurs, réécrit en scalaires sans tableaux,
    vecteurs ni fonctions temporaires par paire. Les collisions entre véhicules, piétons et
    joueur ne dépendent pas de la cadence d'animation d'un squelette.
   La marge supplémentaire autour d'un piéton est retirée du test de priorité routière :
   elle pouvait immobiliser une voiture à côté d'un piéton attendant au passage, alors que
   leurs corps ne se touchaient pas. Les tests d'intersection physiques restent actifs.
11. **Trottoirs** : recherche du nœud proche dans 25 petites cases spatiales, avec repli sur
    le parcours complet pour les points éloignés. Même choix déterministe en cas d'égalité.
    Les recherches de chemins réutilisent une file et des tableaux de parents/visites ;
    chaque requête conserve son chemin indépendant et les règles de traversée des feux.

### Anticrénelage WebGL

L'option native `antialias` est un attribut **immuable à la création du contexte**. Le preset
la sélectionne à l'entrée dans la scène. Lors d'un changement de qualité en cours de partie,
elle conserve sa valeur jusqu'à la prochaine création naturelle de scène ; le DPR, les
ombres et les autres budgets changent immédiatement. Cela évite une reconstruction WebGL
à chaque adaptation automatique. `__LOME_STREET.contextAntialias` expose la valeur réelle ;
elle n'est pas présentée comme un réglage commutable à chaud.

## Validation et reproduction

Validation locale : **405 tests unitaires/SQL**, **34 tests de durcissement**, typecheck,
contrôles de sécurité statiques, **12 scénarios navigateur** PC/Android sélectionnés
(maison, circulation, qualité/carte, relais, moto et taxi rémunéré) et **2 scénarios de mesure**.
Biome passe sur les fichiers modifiés, avec les avertissements existants conservés.

```sh
HAROOLIFE_TEST_PORT=3215 HAROOLIFE_SUPABASE_PORT=54380 \
NEXT_PUBLIC_TURNSTILE_SITE_KEY='' HAROOLIFE_PERF_PHASE=after \
PW_CHROMIUM_PATH=/usr/bin/chromium \
npx playwright test --config=e2e/lome-engine-perf.config.ts

HAROOLIFE_TEST_PORT=3215 HAROOLIFE_SUPABASE_PORT=54380 \
NEXT_PUBLIC_TURNSTILE_SITE_KEY='' PW_CHROMIUM_PATH=/usr/bin/chromium \
npx playwright test --config=e2e/lome-engine-regression.config.ts
```

Les fixtures sont locales : Supabase simulé et vrai relais Socket.IO avec SQL PGlite isolé.
Aucun compte de production, paiement réel ou donnée Supabase de production n'est créé.
Les tests vérifient la continuité de la scène après carte/qualité, les bulles statiques, les
six véhicules de circulation, les avatars et véhicules du relais, la taille et le salaire
automatique du taxi, la moto, les portes et les actions quotidiennes retenues.

Tests unitaires : 10 000 paires de collisions tournées confrontées au SAT original ; géométrie
et normales des maisons identiques ; triangles/UV/matériaux et limites des modèles fusionnés ;
éviction mémoire et transfert de propriété du cache ; DPR et dimensions du taxi.
La comparaison géométrique avec le code de référence couvre aussi 40 tuiles/niveaux de détail,
soit 593 953 triangles : mêmes positions, normales, couleurs et orientation de chaque face
(comparaison à 10⁻⁵ d'unité),
indépendamment de l'ordre des faces dans les buffers.

Pour Android matériel : ouvrir cette même sauvegarde dans Chrome, activer le diagnostic dans
Téléphone → Réglages, profiler par débogage USB en qualités Économie puis Équilibré ; répéter
après dix minutes de jeu, une entrée/sortie de maison, une course automatique et deux joueurs.
Contrôler p95, pertes de contexte, mémoire et température avant d'affirmer une cible de FPS.
