# HarooVille — rendu 3D véritable, sans réécrire le moteur

Les piétons de la carte utilisent toujours les personnages glTF habillés et animés du catalogue
HarooLife. Les anciens personnages statiques cuits dans le pack ne sont plus utilisés comme
fallback : aucun avatar cubique ne doit apparaître lorsque la qualité graphique baisse.

## Motivation
Le rendu isométrique 2D constitué de tuiles cubiques Kenney Sketch Town reste trop pauvre. Le mode principal devient un véritable environnement **WebGL2 / PlayCanvas** (déjà installé), et le Canvas 2D demeure un mode léger de repli.

## Assets open source réellement intégrés
Source de distribution : https://github.com/Hidencod/tge-assets — modèles Kenney sous licence **CC0 1.0 Universal**, prouvée dans son fichier LICENSE. Site de l'auteur : https://kenney.nl.

- `public/haroolife/vendor/kenney-3d/suburban/` : trois variantes de maisons.
- `public/haroolife/vendor/kenney-3d/commercial/` : deux types de commerces.
- `public/haroolife/vendor/kenney-3d/nature/` : arbres, palmiers, buissons, rochers et épis de maïs (modèles GLB).
- `public/haroolife/vendor/kenney-3d/characters/` : personnage.
- `public/haroolife/vendor/kenney-3d/roads/` : modèle de route, réservé pour l'évolution de la topologie.

Les modèles sont **copiés en local** : aucune requête à GitHub Pages ou à un CDN externe durant le jeu.

## Technique
- `components/haroolife/city-world-3d.tsx` utilise `@playcanvas/react`, `useModel` et `Gltf`.
- La grille de la simulation reste inchangée (22 × 22). Les 484 parcelles ont une surface cliquable WebGL.
- Les maisons/commerces/mairie/cultures sont des modèles réels, pas des cubes 2D pré-rendus.
- Le terrain comprend forêts, eau, pistes, quelques habitants et buissons. La scène est symbolique et ne reproduit pas les coordonnées réelles de Kpalimé.
- Gestes : clic/toucher pour construire, glisser pour déplacer le quartier, boutons de zoom, rotation, recentrage.
- Le moteur économique reste déterministe et la sauvegarde localStorage est partagée entre les deux vues.
- Si WebGL2 indisponible : basculement automatique vers le mode Canvas léger.

## Limites explicites
Il s'agit d'une **première évolution 3D jouable**, pas de Townsmen 5 lui-même. Les modèles Kenney sont low-poly, les citoyens ne disposent pas encore d'un pathfinding physique et les productions se calculent côté simulateur. Le moteur 3D n'est ni un inventaire par bâtiment ni une carte nationale géométriquement exacte. Ne pas commercialiser le rendu comme une copie de Townsmen ; nos licences sont CC0 et le gameplay demeure original.

## Recette requise
- Vérifier bureau et Android WebGL2 : scènes, clic de parcelle, glisser-déplacer, zoom et rotation.
- Vérifier que maisons/usines réellement construites sont dessinées dans la vue 3D.
- Vérifier la synchronisation 2D ↔ 3D et les sauvegardes après rechargement, y compris le cas de famine.
- Mesurer le framerate, les requêtes GLB et mémoire sur appareils Android modestes, puis ajouter une politique LOD/instancing si nécessaire.
- Ne pas fusionner la PR tant que la qualité et les interactions ne sont pas validées.
