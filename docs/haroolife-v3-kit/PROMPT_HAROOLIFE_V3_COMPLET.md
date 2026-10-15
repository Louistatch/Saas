# HarooLife — prompt V3 complet : avatars, carte et interactions

À joindre à Claude Code dans `Louistatch/Saas`, avec les captures Lagos Life et les trois captures du résultat actuel. Ce prompt remplace les précédents pour cette correction. Les kits joints sont prêts à importer ; le complément V3 en fin de document précise la carte et les interactions.

## Ce qui a échoué

L’utilisateur refuse le résultat : il ne retrouve pas la présentation de Lagos Life ni les interactions de la référence jouable. Il signale des personnages qui marchent à reculons et un avatar sans tenue visible.

Les captures permettent de constater :

- `1000361224.png` : survol très large de Kara, nombreux noms de lieux superposés, personnage peu identifiable, joystick et bouton Entrer encore présents dans cette vue.
- `1000361223.png` : téléphone sous forme de grande fiche, diagnostic FPS/réseau et qualité graphique placés avant les applications.
- `1000361222.png` : vue plus proche, mais avatar très blanc, vêtements/peau peu différenciés et filtres encore présents pendant le jeu rapproché.

Une capture fixe ne prouve pas un moonwalk. Ce défaut est rapporté par l’utilisateur et doit être reproduit en vidéo. La cause du personnage blanc reste à établir.

Le 14 octobre 2026, une nouvelle lecture du code a confirmé que le catalogue Quaternius existe déjà dans Saas. Il est donc inutile de recommencer son ajout. Les points à examiner sont notamment : `avatar-catalogue.ts` applique `yaw: 180` aux quatre adultes, normalise leurs tailles à partir de `FIGURE_HEIGHT = 0.66`, et conserve des avatars mini. Les deux composants Character recolorent des matériaux dans des effets avec nettoyage. Aucun de ces constats ne prouve à lui seul la cause du défaut affiché.

---

## PROMPT À EXÉCUTER

Tu travailles sur **HarooLife dans le dépôt existant `Louistatch/Saas`**. Le résultat livré a été refusé. Corrige le jeu existant et livre une expérience visuellement proche des captures de **Lagos Life** : personnages adultes habillés, pièces ouvertes meublées, caméra rapprochée, interactions avec les objets et téléphone immersif.

Référence fonctionnelle complémentaire : https://haroolife-city-louis.louis1994.chatgpt.site. Cette adresse peut être privée ; son inaccessibilité ne bloque pas le travail, car les critères ci-dessous et les captures définissent le résultat attendu.

**Priorité immédiate : réparer cette expérience Lagos Life.** La précédente idée de GTA Lomé, de caméra derrière le personnage, de motos et de Zman concerne une évolution ultérieure. Elle ne doit pas détourner cette correction du cadrage isométrique demandé.

Ne termine pas avec « les tests passent » si le joueur reste blanc, marche en reculant, ou ne peut pas interagir avec les meubles. Une amélioration du moteur, des documents ou du nombre d’images/s ne suffit pas à répondre à ce brief.

### 1. Vérifier ce qui tourne réellement

Lis les instructions du dépôt, son statut Git, ses scripts et les modifications récentes. Préserve le travail existant. Travaille sur une branche de correction ciblée.

Identifie le commit exécuté, le renderer réellement actif et les préférences persistées du navigateur. Vérifie si `/haroolife`, la localité sélectionnée et les intérieurs utilisent les composants que tu modifies. Une correction visible seulement avec un paramètre technique ou dans une page de test n’est pas le résultat demandé.

Commence par ces fichiers, si leurs chemins existent encore :

```text
app/haroolife/layout.tsx
components/haroolife/lome-life-immersive.tsx
components/haroolife/city/city-world.tsx
components/haroolife/city/character.tsx
components/haroolife/city/player-rig.tsx
components/haroolife/city/interior-scene.tsx
components/haroolife/engine-three/character.tsx
components/haroolife/engine-three/interior-three.tsx
lib/haroolife/city/avatar.ts
lib/haroolife/city/avatar-catalogue.ts
lib/haroolife/city/player.ts
lib/haroolife/city/geometry.ts
lib/haroolife/city/interiors.ts
lib/haroolife/engine/select.ts
lib/haroolife/engine/types.ts
e2e/lome-life-playwright.config.ts
```

Le catalogue et les avatars adultes sont déjà présents dans le code lu le 14 octobre. Contrôle leurs fichiers réels avant de les remplacer. Conserve le montage persistant du jeu, ses comptes, son domaine, ses sauvegardes et ses services. Les dépendances installées dans Saas restent la base de travail.

### 2. Utiliser les skills pour corriger, pas pour recommencer

Utilise le pack officiel de son auteur : https://github.com/majidmanzarpour/threejs-game-skills.

Charge `threejs-game-director`, puis les spécialistes utiles :

- `threejs-debug-profiler` : orientation, matériaux, animations et entrées ;
- `threejs-gameplay-systems` : approche d’objet, collisions et cycle d’interaction ;
- `threejs-aaa-graphics-builder` : cohérence des modèles, vêtements, éclairage et cadrage ;
- `threejs-game-ui-designer` : HUD, téléphone et usage au pouce ;
- `threejs-qa-release` : preuves navigateur, captures et preuves de mouvement.

Lis leurs vrais `SKILL.md` et les références pertinentes. Si le pack n’est pas installé, la commande documentée pour Claude Code est :

```bash
npx skills add majidmanzarpour/threejs-game-skills --skill "*" -a claude-code -g -y
```

Ce brief prime sur les options génériques du pack : **style low-poly de Lagos Life, assets réutilisables, performances mobiles, correction du dépôt existant**. Ne crée pas un nouveau scaffold Vite, une nouvelle démo séparée ou des assets payants pour contourner le problème. Le nom du skill « AAA » ne demande pas un rendu photoréaliste.

Si les skills ne sont pas accessibles, continue directement avec le code et les critères de ce prompt. Ne prétends pas avoir exécuté un skill seulement parce que son nom apparaît dans un rapport.

### 3. Réussir une scène témoin avant toute extension

Construis d’abord **la maison du joueur** avec les éléments suivants réellement visibles et utilisables :

- un avatar adulte entièrement habillé, peau et vêtements différenciés ;
- lit, cuisine, douche/toilettes, canapé, table et porte ;
- deux murs arrière, façade et toit ouverts, sol clair, lumière lisible ;
- marche par joystick, clavier et toucher du sol ;
- action sur un objet, approche du personnage, activité visible, effet sur les besoins ;
- sortie vers la rue puis retour dans la même maison.

Utilise les actions et les effets du domaine existant. Ne détourne pas les services Saas pour leur substituer une nouvelle économie locale. La scène doit être ouverte depuis le bouton Maison de l’entrée normale du jeu, avec une ancienne sauvegarde comme avec une nouvelle partie.

Ne généralise pas le rendu aux autres lieux tant que cette scène présente un défaut bloquant parmi : avatar blanc, tenue absente, marche à reculons, mobilier inaccessible, caméra trop éloignée ou action sans effet.

### 4. Corriger le moonwalk par mesure

Reproduis le défaut pour le joueur et les PNJ, dehors et dedans. Sépare cinq causes possibles :

1. direction avant réelle du fichier GLB ;
2. rotation du parent de déplacement et rotation locale de la figure ;
3. conversion entre coordonnées écran, caméra et monde ;
4. sélection, sens et vitesse du clip ;
5. translation du contrôleur et éventuel déplacement porté par le squelette.

Le code actuel contient un `yaw: 180` dans le catalogue adulte. La référence jouable orientait directement le root du personnage par `atan2(dx, dz)`. **Ne conclus pas sans vérifier que tous les modèles ont besoin de 180° ou de 0°.** Mesure la direction avant de chaque fichier utilisé dans le renderer réel.

Établis une convention unique : heading 0 vers +Z, heading 90° vers +X, et un décalage local de modèle appliqué une seule fois. Avec cette convention, une direction de mouvement monde donne :

```text
desiredHeadingRadians = atan2(actualDeltaX, actualDeltaZ)
```

Three.js reçoit des radians ; PlayCanvas reçoit des degrés. L’orientation de la caméra intervient dans la conversion des entrées, pas une seconde fois dans la rotation finale du personnage. Vérifie toute la hiérarchie parent → figure → squelette, pas seulement la valeur affichée par le contrôleur.

Après stabilisation d’un virage, le vecteur avant réel du personnage et son déplacement doivent pointer dans le même sens. Comme contrôle indicatif, leur produit scalaire normalisé doit dépasser 0,9 lors d’une marche rectiligne. La direction avant du modèle doit d’abord être calibrée visuellement ; un calcul basé sur un axe arbitraire ne prouve rien.

Pour le cycle de marche :

- Les GLB de référence contiennent `Idle`, `Idle_Neutral`, `Interact`, `Run`, `Walk`, `Wave`. Vérifie le clip réellement actif et son avancement temporel.
- Utilise la vitesse de déplacement **réalisée**, après collision, pour choisir Idle/Walk/Run. Un personnage bloqué contre un mur ne doit pas continuer à marcher sur place.
- Convertis les unités : le contrôleur extérieur utilise des cellules, tandis que le renderer applique `worldPos` et `CELL`. Une vitesse en cellules/s n’est pas automatiquement une vitesse en unités de rendu/s.
- Calibre la cadence à la taille finale et à la foulée du modèle. Le rapport à `config.walkSpeed` ne garantit pas que les pieds correspondent au sol.
- Identifie les éventuelles pistes de translation de racine. Choisis une stratégie cohérente entre mouvement in-place et root motion ; évite une double translation. Préserve le mouvement vertical normal des hanches.
- Ne corrige pas le défaut en jouant Walk à vitesse négative, en inversant le joystick ou en ajoutant plusieurs rotations compensatoires dans différents composants.
- Les clips d’entrée, de conversation ou d’activité doivent rendre la main à la locomotion. Ils ne doivent pas rester verrouillés après une porte ou une interaction.

Filme une marche vers les quatre directions, deux diagonales, deux demi-tours, l’arrêt et la reprise, puis un PNJ sur un trajet aller-retour. Montre le résultat rendu ; une assertion sur `heading` seul ne suffit pas.

### 5. Rendre les vêtements et les matériaux fiables

Utilise en priorité les quatre modèles habillés de la référence :

| Identifiant adulte actuel | GLB |
|---|---|
| `afi` | `Women_Casual.glb` |
| `abra` | `Women_Formal.glb` |
| `kossi` | `Casual_2.glb` |
| `koffi` | `Casual_Hoodie.glb` |

Les packs sources sont Quaternius Ultimate Modular Men et Women, CC0. Les fichiers optimisés de référence se trouvent ici :

```text
https://github.com/martian56/ufazien/tree/main/frontend/public/avatars
https://github.com/martian56/ufazien/blob/main/frontend/scripts/build-avatars.mjs
```

Inspecte d’abord les GLB déjà présents dans `public/haroolife/vendor/quaternius/`. Inventorie les meshes, les matériaux, leurs couleurs, les textures éventuelles et les clips. Compare cet inventaire aux objets réellement instanciés dans PlayCanvas et Three.js.

Le personnage blanc peut venir de plusieurs causes : ancien avatar restauré, matériaux non appliqués, mauvaise correspondance de noms, mesh de vêtement absent, texture manquante, vertex colors ignorées, problème de shader ou nettoyage d’un matériau encore utilisé. Établis la cause avant la correction.

À respecter :

- Conserver tous les meshes du vêtement, les pantalons/jupes et les chaussures ; ne charger aucun corps de base non habillé comme personnage final.
- Cloner et recolorer les matériaux par personnage ; conserver une référence aux matériaux source avant recoloration.
- Examiner les effets de recoloration actuels : lors d’un changement de tenue, ils peuvent lire des matériaux déjà remplacés puis nettoyés. La correction doit restaurer ou reconstruire une base saine avant de libérer les anciens matériaux.
- Le cache de matériaux ne doit pas fusionner deux matériaux distincts uniquement parce qu’ils partagent un nom. Les géométries et textures communes ne doivent pas être détruites avec un costume individuel.
- Sur Three.js, conserver les paramètres PBR, maps, transparence et vertex colors pertinents. Sur PlayCanvas, vérifier les matériaux StandardMaterial réellement associés aux meshInstances et leur mise à jour.
- La recoloration de peau ne doit jamais repeindre tout le corps et effacer les vêtements.
- Dans les fichiers de référence, les matériaux utiles peuvent inclure `Skin`, `Skin_Darker`, les noms commençant par `Hair`, `Red_Dark`, `Purple`, `Orange`, `Red`, `LimeGreen`. Vérifie chaque fichier ; n’applique pas une table supposée universelle.

Base visuelle : peaux brunes, cheveux foncés, vêtements verts, bleus, terracotta ou ocre. Une tenue doit être reconnaissable à la distance de jeu normale. Ne masque pas les erreurs de matériaux avec un éclairage blanc intense, du brouillard ou une teinte globale.

**Anciennes sauvegardes :** elles doivent garder leur argent, leurs besoins, leurs lieux, leurs achats et leur identité. Un ancien identifiant mini reste décodable, mais l’apparence affichée par défaut peut être son équivalent adulte habillé : female-a → afi, female-b → abra, female-c → afi, male-a → kossi, male-b → koffi, male-c → kossi. Préserve l’apparence historique pour retour possible et conserve les préférences de couleur. Une progression ancienne ne doit pas laisser le joueur bloqué sur un avatar visuellement défectueux.

Teste également quatre changements de tenue successifs, plusieurs changements de modèle et dix entrées/sorties. Aucun matériau blanc, disparu ou détruit ne doit apparaître après ces transitions.

### 6. Corriger proportions et caméra ensemble

Le catalogue actuel conserve une base `FIGURE_HEIGHT = 0.66` pour adapter les adultes aux anciens mini-personnages. Cette compatibilité ne suffit pas à obtenir le rendu attendu.

Choisis des proportions cohérentes entre adulte, chaise, table, lit, porte et capsule. Adapte collider, point au sol, position assise, hauteur d’étiquette et points d’interaction à la taille mesurée. Ne réduis pas systématiquement un adulte pour lui faire entrer dans une capsule miniature.

Dans une vue mobile de 412 × 915 pixels CSS, vise initialement un avatar de 100 à 160 pixels de haut dans la maison et de 80 à 140 dans la rue, puis ajuste contre les captures. Laisse une grande partie de l’écran au lieu lui-même. Ces mesures sont des cibles de cadrage, pas des garanties de fidélité.

La vue isométrique doit permettre d’identifier immédiatement les vêtements, les objets et la porte. Elle peut être orthographique ou perspective légère selon l’intégration existante, mais doit reproduire la composition des références. Réduire une constante de distance sans contrôler le renderer actif, la cible et les unités ne suffit pas.

Au chargement/rechargement et après un trajet : entrer dans une vraie vue de jeu rapprochée. Une localité Kara restaurée doit rester Kara ; elle ne doit pas être remplacée arbitrairement par Lomé. Applique le même langage visuel aux localités existantes.

### 7. Séparer carte et lieu de vie

Crée deux modes explicites avec leurs propres cadrages et contrôles :

| Mode | Ce qui apparaît |
|---|---|
| Jeu dans un lieu ou une rue | Joueur, objets proches, joystick, interaction contextuelle, HUD compact. |
| Carte | Vue d’ensemble, filtres de lieux, zoom/déplacement, sélection d’une destination et fiche de trajet. |

La carte générale ne doit plus être l’écran permanent du personnage. Sur mobile, traite les collisions d’étiquettes : afficher les lieux sélectionnés, proches ou pertinents au zoom, et regrouper/masquer les autres. Comme point de départ, quatre à huit noms simultanément sont plus lisibles que toutes les destinations superposées.

Masque le joystick et le bouton Entrer pendant la consultation de la carte. Les filtres Maisons/Commerces/Éducation apparaissent sur la carte, pas devant le lit, le joueur ou le téléphone. Fermer la carte restaure le cadrage de jeu précédent. La carte reste une composition togolaise stylisée ; ne prétends pas avoir importé le mapping propriétaire de Lagos Life.

### 8. Restaurer les vraies interactions du lieu

Le cycle attendu est :

```text
Objet touché → point d’approche libre → déplacement → orientation vers l’objet
→ vérification de distance → activité → effet métier unique → retour aux commandes
```

Réutilise les contrôleurs, la navigation, les actions et les sauvegardes du dépôt. Une icône peut annoncer une action, mais le personnage doit réellement se rapprocher du meuble.

Vérifie pour chaque interaction : objet affiché, hitbox, point d’approche, obstacles, orientation, animation disponible, durée, interruption et effet final. Si l’approche échoue, informer le joueur et ne pas déclencher l’action à distance. Pendant une activité, bloquer les commandes concernées et empêcher le double déclenchement.

Les actions suivantes doivent être démontrables depuis la scène témoin :

- toucher la cuisine, s’approcher, préparer/manger un repas, constater l’évolution de faim/temps/solde selon les règles existantes ;
- toucher le lit, s’approcher, commencer le repos et constater le regain d’énergie ;
- utiliser douche/toilettes et constater l’évolution des besoins ;
- toucher un PNJ, s’approcher, ouvrir un dialogue contextualisé et pouvoir le fermer ;
- toucher la porte, sortir à un emplacement libre, puis rentrer ;
- effectuer une mission, toucher la récompense une seule fois, acheter et placer un meuble, recharger et retrouver le résultat.

Si le pack n’a pas d’animation d’assise, de sommeil ou de douche, utilise un repli visuel propre et honnête : position adaptée, orientation, indicateur d’activité et animation disponible. Un avatar qui traverse le lit, une T-pose ou une animation inventée ne sont pas acceptables. Cherche une animation compatible seulement si elle est nécessaire et vérifiable.

Assure la même commande d’interaction dans le renderer livré par défaut. Ne laisse pas la marche et les interactions fonctionnelles uniquement dans un chemin Three.js masqué derrière un flag alors que l’utilisateur reçoit PlayCanvas.

### 9. Refaire le téléphone et dégager le HUD

Sur les captures Lagos Life, le téléphone est un véritable appareil superposé : cadre sombre, écran, barre d’état, grille d’applications et bouton Fermer. La capture refusée montre surtout une fiche de réglages avec une grille violette.

Réalise un téléphone portrait cohérent avec la référence : largeur adaptée à l’écran, hauteur limitée au viewport utile, zone interne scrollable, ouverture/fermeture simple et contenu fonctionnel. Métier, messages, portefeuille, carte, aide et apparence restent reliés aux fonctions existantes. Le cadre du téléphone ne doit pas cacher un bouton indispensable.

Déplace les diagnostics FPS/réseau et la qualité graphique dans **Réglages → Avancé**. Par défaut, aucun panneau de debug noir sur le monde ni diagnostic avant les applications. Conserve les diagnostics accessibles pour les développeurs.

HUD de jeu : heure, humeur, monnaie et besoins compacts ; navigation inférieure Maison/Aménager/Carte/Téléphone ; objectif et action contextuelle utiles. Évite le cumul de filtres, noms de lieux, joystick, panneaux de construction et contrôles techniques sur une seule vue.

Conserve les comptes et la messagerie réelle du Saas. Les PNJ doivent rester identifiés comme tels ; aucun faux compteur de personnes connectées. Le compte ChatGPT de la référence hébergée n’est pas le compte FaîtiereHub à importer dans Saas.

### 10. Vérifier la fidélité, pas seulement la présence des fonctions

Prépare des captures avant/après du jeu réel, dans le même état et au même viewport :

1. maison : avatar habillé, meubles, porte et commandes ;
2. rue rapprochée : joueur et PNJ visibles ;
3. carte : noms lisibles sans chevauchement massif ;
4. téléphone fermé puis ouvert ;
5. interaction de cuisine avant, pendant et après.

Utilise au minimum 412 × 915 et 1440 × 900. Sur le téléphone de l’utilisateur, la barre du navigateur réduit la zone utile : contrôle les dimensions CSS effectives et les safe areas. Ne compare pas des captures à des échelles différentes comme si elles étaient équivalentes.

Ajoute une capture vidéo du mouvement et des transitions d’interaction. Les images doivent venir du rendu exécuté, pas d’images générées ou d’une autre démo.

Le test doit utiliser les quatre modèles réellement chargés et les anciennes sauvegardes. Une assertion « un GLB existe », « une animation s’appelle Walk » ou « heading a changé » n’établit pas qu’un personnage habillé marche correctement.

### 11. Critères de réception bloquants

| Critère | Preuve attendue |
|---|---|
| Avatar adulte habillé | Capture rapprochée montrant peau, cheveux, haut/bas et chaussures différenciés. |
| Marche correcte du joueur | Vidéo quatre directions, diagonales et demi-tours ; pas de recul permanent ou de glissement manifeste. |
| Marche correcte des PNJ | Vidéo aller-retour avec orientation et cadence cohérentes. |
| Matériaux stables | Changements d’apparence et transitions de lieux sans personnage blanc ni disparition de vêtement. |
| Maison jouable | Cuisine, lit, hygiène et porte atteignables depuis la scène par toucher/joystick. |
| Effets d’interaction | Besoins, temps, argent et récompense corrects ; aucun effet ou débit doublé. |
| Carte distincte | Aucune superposition massive de noms ; retour correct à une vue rapprochée. |
| Téléphone conforme | Appareil portrait fonctionnel ; diagnostics avancés hors de la vue par défaut. |
| Partie ancienne conservée | Argent, inventaire et lieu conservés, apparence correctement résolue et habillée. |
| Stabilité | Dix cycles maison/rue sans canvas noir, entrées bloquées ou croissance continue inexpliquée de ressources. |

Mesure les performances sur une scène comparable à l’état initial. Les captures actuelles affichent environ 50–54 images/s, mais ce compteur seul ne valide ni animation, ni fidélité, ni interaction. Évite de dégrader cette fluidité pour ajouter des effets décoratifs.

### 12. Tests, preuves et livraison

Réutilise les tests HarooLife existants et ajoute seulement les contrôles manquants nécessaires à ces défauts : orientation du mesh final, résolution des anciens avatars, matériaux après changement, approche d’objet, effets uniques et retour de caméra.

Exécute les scripts réellement disponibles, notamment typecheck, build, lint Biome et les scénarios HarooLife Playwright pertinents. Conserve les probes `__LOME_SCENE`, `__LOME_PLAYER`, `__LOME_PERF` lorsque les tests en dépendent. Les vérifications de sécurité du dépôt restent applicables à la livraison.

Tiens deux notes courtes :

- `artifacts/haroolife-correction-progress.md` : défauts observés, causes confirmées, corrections et reste à vérifier ;
- `artifacts/haroolife-correction-evidence.md` : commit testé, renderer/asset réellement utilisés, captures, vidéo, tests exécutés et limites.

Le rapport final doit distinguer ce qui a été vu dans le navigateur de ce qui a seulement été vérifié par tests. Si le navigateur manque, fournis les contrôles possibles et indique explicitement que la validation visuelle et du moonwalk reste incomplète. N’annonce pas une reproduction fidèle sur cette seule base.

Termine par le résultat jouable et ses commandes, les preuves avant/après, les fichiers changés et les défauts restants. Prépare le commit et la PR selon le workflow du projet. Si une publication est déjà autorisée, déploie le commit vérifié et vérifie le même parcours sur la version publiée ; sinon fournis la version de revue et son état exact.

**Commence maintenant : reproduis les défauts, réussis la scène témoin, corrige les mouvements et les vêtements, puis vérifie les interactions, la carte et le téléphone. Ne t’arrête pas à l’installation du skill ou à un changement de couleurs.**

---

## Sources et portée de cette révision

- Code actuel examiné : `Louistatch/Saas`, composants Character PlayCanvas/Three.js, PlayerRig, contrôleur PlayerController et catalogue d’avatars.
- [Catalogue d’avatars](https://github.com/Louistatch/Saas/blob/main/lib/haroolife/city/avatar-catalogue.ts).
- [Character PlayCanvas](https://github.com/Louistatch/Saas/blob/main/components/haroolife/city/character.tsx).
- [Character Three.js](https://github.com/Louistatch/Saas/blob/main/components/haroolife/engine-three/character.tsx).
- [Contrôleur de déplacement](https://github.com/Louistatch/Saas/blob/main/lib/haroolife/city/player.ts).
- [Skill directeur examiné](https://github.com/majidmanzarpour/threejs-game-skills/blob/main/skills/threejs-game-director/SKILL.md).
- [Personnages Quaternius](https://quaternius.com/packs/ultimatemodularcharacters.html) et [Women](https://quaternius.com/packs/ultimatemodularwomen.html).
- [Mobilier Kenney](https://kenney.nl/assets/furniture-kit).

Ce fichier fournit un prompt de correction. Il ne prétend pas que ces corrections ont déjà été appliquées au Saas, ni que la rotation de 180° constitue une cause confirmée sans observation en mouvement.


---

## Complément prioritaire V3 — carte aérée, kits préconçus et interactions

Ce complément fait partie du prompt principal. Il précise la section Carte du V2 et ajoute les comportements montrés par les nouvelles captures. Conserve les corrections de vêtements, de locomotion et d'interactions du V2.

### A. Lire les références comme une organisation de jeu

Les captures Lagos Life montrent :
- une vue de carte avec eau, routes, parcelles séparées, espaces verts et icônes circulaires ;
- un quartier résidentiel dense, mais situé dans une zone distincte des lieux publics ;
- quelques bâtiments hauts servant de repères, sans immeuble sur chaque parcelle ;
- une zone aéroport séparée, une zone industrielle et des panneaux publicitaires interactifs ;
- une salle de sport ouverte, avec le joueur et les autres personnes à portée d'interaction ;
- une fiche de joueur, une conversation privée, des invitations/visites et des choix d'événement.

Il peut y avoir de nombreuses icônes sur une carte. Le défaut à corriger est la superposition et l'absence de hiérarchie : distinguer densité géométrique, densité des icônes et densité des textes. Ne transforme pas la carte en une simple grille de noms, ni en une carte presque vide sans destinations utiles.

### B. Utiliser les modèles livrés dans ce pack

Les fichiers ont été téléchargés depuis Kenney, leurs archives et licences inspectées. Le pack rassemble **213 GLB**, leurs textures référencées, les licences et des aperçus. Ils constituent un kit de construction 3D ; ils ne contiennent pas la carte propriétaire de Lagos Life ni les règles de jeu.

| Dossier | Modèles GLB inclus | Usage proposé |
|---|---:|---|
| assets/city-commercial | 41 | Bâtiments de services, commerce, quelques repères hauts et variantes de faible détail |
| assets/city-suburban | 40 | Maisons, clôtures, jardins, arbres et accès |
| assets/city-roads | 95 | Routes, croisements, trottoirs, ponts, lampadaires et signalisation |
| assets/city-industrial | 37 | Entrepôts, réservoirs, containers et équipements industriels |

Sources officielles :
- https://kenney.nl/assets/city-kit-commercial
- https://kenney.nl/assets/city-kit-suburban
- https://kenney.nl/assets/city-kit-roads
- https://kenney.nl/assets/city-kit-industrial

Toutes les licences inspectées déclarent CC0. Le manifeste indique aussi les URL et empreintes des archives téléchargées. Les nombres de GLB vérifiés peuvent différer du compteur « Files » du site.

Copie uniquement les modèles nécessaires dans le répertoire public du dépôt, en conservant chaque dossier Textures associé. Chaque collection possède son propre colormap.png : **ne fusionne pas les quatre textures sous un nom unique**.

Exemples de fichiers réellement présents :
- commercial/building-a.glb, building-b.glb, building-skyscraper-a.glb, low-detail-building-a.glb, detail-awning.glb ;
- suburban/building-type-a.glb, building-type-b.glb, driveway-short.glb, fence-low.glb, tree-small.glb ;
- roads/road-straight.glb, road-crossroad.glb, road-crossing.glb, road-bridge.glb, bridge-pillar.glb, light-curved.glb ;
- industrial/building-a.glb, detail-tank-large.glb, shipping-container-a.glb, water-tower.glb.

Les préfixes ci-dessus désignent les collections, pas un dossier intérieur aux GLB. Respecte les vrais chemins dans assets/city-*.

Inspecte les aperçus avant de choisir les bâtiments. Mesure les bounding boxes, axes, pieds et emprises des modèles. N'assigne pas un nom de clinique à un modèle quelconque sans vérifier sa silhouette et la signalétique du lieu.

La plupart des GLB de ces kits utilisent une image externe relative Textures/colormap.png. Le chargement doit réussir sans hotlink. Un fichier GLB valide et une texture absente donnent précisément un résultat visuel défectueux.

Garde Kenney Furniture Kit pour les intérieurs déjà disponibles et les avatars Quaternius habillés. N'ajoute pas tous les modèles à la scène ni au chargement initial.

### C. Composer la carte à partir de zones et de destinations

Conserve les IDs des lieux, localités, parcelles et résidences du domaine. La représentation visuelle doit référencer ces IDs ; un nouveau bâtiment ne crée pas un deuxième marché ou une seconde maison du joueur.

Utilise un manifeste d'assets statiques et des placements par données. Pour chaque lieu, relie :
- identifiant existant et catégorie ;
- modèle choisi et transformation ;
- emprise visuelle et éventuels obstacles ;
- icône et ancre de marqueur ;
- porte et point d'approche dans le monde jouable ;
- destination de transport ;
- scène intérieure et catalogue d'actions ;
- source d'identité, présence, publicité ou service si applicable.

Une description de placement est une donnée de scène, pas une migration de compte ou une autorisation métier.

Compose des ensembles lisibles : résidentiel, commerces/services, campus/sport, marché/ferme, littoral, industriel. Réutilise les localités déjà existantes. Les destinations du Togo ne doivent pas être déplacées ou réinitialisées au hasard pour ressembler à Lagos.

Si la grille logique existante produit une ville uniformément dense, choisis le moyen le plus sûr :
1. adapter les règles de placement et de détail en préservant les emplacements persistés ; ou
2. créer une projection de carte stylisée, distincte du monde de déplacement, dont chaque destination renvoie au lieu existant par ID.

Dans le second cas, la carte n'est pas un collider. Toute conversion nécessaire doit être explicite ; ne passe pas les coordonnées stylisées au contrôleur physique ou à une sauvegarde de résidence.

Première cible d'assemblage : deux ensembles cohérents reliés par une route/pont, environ douze destinations utiles, une zone résidentielle regroupée et des surfaces libres. Étends ensuite aux lieux existants en gardant cette composition. Ce nombre est un point de départ de validation, pas une limite supprimant le catalogue Saas.

À l'échelle quartier, vise initialement 30–40 % de surface de carte visuellement libre — eau, jardins, places, espacements — hors HUD. Ajuste après comparaison avec les références. Les espaces verts doivent être utiles à la composition, pas un simple fond derrière un maillage de bâtiments.

Les silhouettes doivent rester distinctes :
- maisons basses regroupées ;
- bâtiments publics sur parcelles espacées ;
- un petit nombre de tours servant de repères ;
- aire industrielle à l'écart ;
- berges/littoral et ponts visibles lorsqu'ils correspondent à la localité stylisée.

Les kits ne contiennent pas un aéroport complet vérifié. Pour une destination aéroport existante, recherche un kit compatible et réutilisable avant d'ajouter des détails spécialisés ; compose seulement les éléments manquants simples. Ne présente pas un entrepôt rebaptisé comme une maquette d'aéroport achevée. L'aéroport est secondaire tant que la maison, le marché et la salle de sport ne sont pas jouables.

### D. Marques et étiquettes lisibles

Par défaut, les POI sont des petites icônes circulaires comme dans les captures, sans long nom affiché en permanence.

- Carte éloignée : icônes et regroupement des destinations proches ; pas de noms au-dessus de chaque maison.
- Carte intermédiaire : icônes des lieux publics avec silhouette lisible.
- Carte rapprochée : nom du lieu sélectionné ou touché, quelques repères voisins.
- Vue de jeu : nom du joueur/PNJ utile, interaction proche et lieu courant ; pas de filtres de toute la carte.

Prévois un bouton Noms, désactivé par défaut. Il affiche les noms selon leur priorité et leur collision à l'écran, pas tous à la fois. Le lieu sélectionné gagne toujours la priorité.

Teste les rectangles projetés après cadrage ; masque/regroupe les marqueurs superposés. Un simple z-index plus élevé ne résout pas une collision. Conserve des cibles tactiles d'environ 44 pixels CSS, même lorsque l'icône dessinée est plus petite.

Un toucher ouvre une fiche. Le geste de pan de la carte ne doit pas sélectionner accidentellement une destination. Fermer une fiche ne doit pas déplacer le joueur. Le joystick est réservé à la vue de jeu.

### E. Chaque lieu possède une fiche qui mène à une action

Réutilise les composants de dialogue, drawer et onglets déjà présents dans Saas. Leurs structures constituent les bases UI réutilisables ; les GLB ne fournissent aucune interaction à eux seuls.

La fiche d'un lieu comporte :
- nom, catégorie et quartier ;
- activités accessibles ;
- description courte et informations disponibles ;
- transports proposés avec prix et durée issus du domaine ;
- bouton d'action clair vers ce lieu.

Le chemin complet doit fonctionner : sélectionner une icône → choisir le transport → confirmer → trajet → arrivée → entrer → interagir → sortir → retour à la carte. Aucune maquette décorative ne valide ce chemin.

Réutilise la publicité existante pour les panneaux : contenu autorisé par le serveur, emplacement associé, clic vers fiche/campagne, traitement des contenus et droits existants. N'affiche pas de fausses campagnes payées, ni des prix de Lagos en nairas dans HarooLife.

Les fiches de transport illustrées par les captures sont une référence de présentation. Reprends uniquement les modes réellement disponibles. Calcul, débit et arrivée doivent être cohérents ; n'ajoute pas de faux billets ou de bouton Book sans comportement.

### F. Joueurs et interactions sociales : modèles d'interface reliés au vrai domaine

Toucher un avatar ou son nom ouvre une fiche contextualisée. Distingue immédiatement PNJ, joueur connecté et profil hors ligne.

La fiche peut présenter :
- nom et avatar habillé ;
- disponibilité et compétences publiques ;
- discuter ;
- visiter/inviter lorsque l'accès est permis ;
- CV/fiche professionnelle selon les données disponibles ;
- proposer un emploi ou ouvrir une mission ;
- bloquer/signaler pour un vrai compte lorsque les services le permettent.

Lis d'abord les adaptateurs d'acteur, de présence, de chat, d'organisation et de métiers du dépôt. Réutilise ces services. Les rôles viennent des sources d'autorisation existantes et ne doivent jamais être attribués en cliquant sur un personnage.

Les aperçus de PNJ peuvent être scénarisés, mais doivent être nommés PNJ et ne pas prétendre montrer un compte ou un CV réel.

Pour la conversation privée montrée dans les captures :
- reprendre le relais Socket.IO et les services de messages existants ;
- vérifier côté serveur les deux participants, l'accès à l'historique et l'abonnement ;
- refuser à une troisième session l'accès à cette conversation ;
- rendre l'envoi idempotent et traiter reconnexion/erreur ;
- ne jamais remplacer un canal privé par le salon du lieu tout en écrivant « seuls vous deux voyez ceci ».

Si aucun service privé n'existe, implémente le contrat nécessaire avec les règles et migrations du projet avant d'activer la fonction. L'apparence d'une conversation ne prouve pas sa confidentialité.

Inviter et visiter demandent une acceptation et les droits d'accès au lieu concerné. Un lien vers une maison n'autorise pas l'accès à une résidence privée.

Le transfert illustré est de la **monnaie virtuelle de jeu**. S'il est retenu, utilise une transaction serveur unique, contrôlant solde, destinataire et doublons, avec débit/crédit cohérents. Un décrément de state.money dans deux navigateurs n'est pas un transfert fiable. Ne crée pas de paiement bancaire ou Mobile Money dans cette tâche.

Les liens familiaux ou de proximité impliquent un état partagé et une acceptation. Ne les implémente pas comme de simples badges locaux. Ces fonctions viennent après le parcours discuter/visiter/mission, afin de ne pas retarder la correction des interactions essentielles.

### G. Événements avec choix ayant un effet

La capture de l'événement universitaire montre un choix d'activité avec prix/effet. Reproduis ce mécanisme avec les événements togolais pertinents et les règles existantes : atelier agricole, activité sportive ou séance AgriAcademy.

Un événement possède un identifiant, un lieu, une période, des choix, des effets et un état de participation. La participation doit être mémorisée et ne pas donner plusieurs fois la même récompense lors d'un rechargement ou d'un double clic.

L'affichage distingue une activité de jeu d'une inscription à une formation réelle. Les formations AgriAcademy réelles doivent garder leurs règles de suivi et d'autorisation.

### H. Skills et ordre d'exécution

Utilise le pack threejs-game-skills déjà indiqué dans le prompt principal :
1. gameplay-systems pour le graphe lieux → trajets → scènes → actions ;
2. aaa-graphics-builder pour sélectionner et assembler les kits ;
3. game-ui-designer pour marqueurs, fiches et interaction mobile ;
4. debug-profiler pour picker, coordonnées, textures et performances ;
5. qa-release pour les scénarios exécutés et la comparaison des captures.

Les noms exacts portent le préfixe threejs-. Lis les SKILL.md réellement installés. Utilise frontend-design pour préciser les composants seulement si nécessaire, en gardant la référence Lagos comme direction prioritaire.

Garde la cible de réparation du V2. N'installe pas un nouvel éditeur de carte ou un nouveau moteur sans besoin établi. Ni Blender ni un générateur 3D n'est nécessaire pour importer ces GLB prêts à l'emploi.

Présente dans le rapport une table « modèle choisi → lieu existant → interaction branchée ». Le nombre de modèles importés ne doit pas devenir un indicateur de réussite.

### I. Preuves supplémentaires de réception

| Parcours | Preuve requise |
|---|---|
| Vue générale et zoom quartier | Bâtiments espacés, zones distinctes, pas de nappe uniforme de tours |
| Icônes et Noms | Noms masqués par défaut, sélection lisible, aucun chevauchement bloquant |
| Transport | Destination, coût, confirmation, trajet et arrivée réellement exécutés |
| Entrée dans un lieu | Porte atteignable, intérieur meublé et actions utilisables |
| Profil et discussion | Fiche adaptée au type d'acteur, message envoyé et reçu par les bonnes sessions |
| Confidentialité | Une troisième session ne peut ni lire ni recevoir un message privé |
| Mission/événement | Effet correct, persistance et absence de récompense doublée |
| Ancienne partie | Même compte, localité, argent, inventaire et progression après reprise |
| Performance | Chargement local des GLB/textures, cache, LOD/instancing et absence de régression excessive |

Capture les états carte éloignée, carte quartier, fiche de destination, trajet, intérieur, fiche de joueur et conversation. Utilise les mêmes dimensions mobiles que le prompt principal. Joins une courte vidéo du parcours destination → intérieur → interaction.

Conserve les captures originales comme références jointes séparément. Les aperçus Kenney de ce pack montrent les assets disponibles, pas le résultat final de HarooLife.

**Exécute le prompt complet avec les fichiers livrés : corrige la scène témoin, compose la carte avec ces kits, branche les interactions et apporte les preuves du résultat réel.**

