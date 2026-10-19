# HarooLife — réutilisation des composants open source

## Composants directement intégrés

1. **Kenney — Sketch Town**, sprites isométriques 2D. Licence **CC0-1.0** (usage commercial autorisé). Source officielle : https://kenney.nl/assets/sketch-town . Copie de 24 tuiles via la collection publique https://github.com/shorepine/kenney/tree/main/2d/Sketch%20Town/Tiles .
   - Ressources locales : `public/haroolife/vendor/kenney-sketch-town/`.
   - Chargement et rendu : `lib/haroolife/vendor/sketch-town-sprites.ts`.
   - Merci à Kenney, attribution facultative.

2. **Cimulity**, `game/render/roadAutoTile.ts`, licence **MIT**. Source : https://github.com/zeikar/cimulity/blob/main/game/render/roadAutoTile.ts . Adaptation directe conservant l'API :
   - Copie source : `lib/haroolife/vendor/cimulity-road-autotile.ts`.
   - Avis de licence : `public/haroolife/vendor/LICENSE-cimulity.txt`.
   - Utilisation : classification de la forme des routes voisines pour afficher les tuiles correspondantes.

3. **Kenney — kits 3D** (City Kit Commercial, City Kit Suburban, City Kit Roads, Car Kit, Mini Market, Mini Characters, Furniture Kit, Nature Kit), modèles glTF-binaire. Licence **CC0-1.0**. Source officielle : https://kenney.nl/assets ; copie via le miroir public https://github.com/shorepine/kenney (`3d/<kit>/<modèle>.glb` et `3d/<kit>/Textures/colormap.png`).
   - Modèles utilisés tels quels (personnages animés, mobilier) : `public/haroolife/vendor/kenney-3d/`.
   - Modèles « cuits » (72 bâtiments, véhicules, mobilier urbain) : `scripts/haroolife-bake-models.mjs` échantillonne la palette de chaque kit par sommet et produit `public/haroolife/city/kenney-pack.{bin,json}` (2,1 Mo, 755 Ko compressés) ; `lib/haroolife/city/pack.ts` les décode et les fusionne dans les maillages de chunk.
   - Les modèles du dépôt `simcity-threejs-clone` (260 GLB sans attribution) n'ont **pas** été réutilisés : provenance et licence non établies.

## Bases étudiées, pas copiées

- **IsoCity** — https://github.com/amilich/isometric-city : MIT, Next.js/TypeScript, rendu Canvas avancé, circulation et PNJ ; dépôt conséquent. Potentiel futur moteur à intégrer par module, après audit des dépendances et licences des médias.
- **IsoCity de Victor Ribeiro** — https://github.com/victorqribeiro/isocity : MIT, petit moteur de rendu isométrique, mais aucune simulation économique. Les graphismes utilisés ici viennent uniquement du pack Kenney ci-dessus.
- **Cimulity complet** — son moteur économique PixiJS est une option pour un deuxième stade. Le noyau complet n'est **pas encore** transplanté.

## Compatibilité et limites

La page existante `/haroolife/territoire` continue d'utiliser son moteur TypeScript et son Canvas. Les nouveaux PNG remplacent les primitives quand ils sont chargés (et le rendu géométrique de secours reste disponible en cas d'échec), sans importer de service distant au runtime.

Les tuiles Sketch Town sont modulaires : les toits et murs sont assemblés dans le Canvas. Il reste à synchroniser parfaitement les orientations de routes, à étendre les kits village/agriculture et à mettre en place de véritables citoyens routés par un graphe de chemin.

Aucun contenu, design, nom de personnage ou ressource de l'éditeur du jeu Townsmen n'est copié. Les images Kenney ne représentent pas des bâtiments togolais réels.
