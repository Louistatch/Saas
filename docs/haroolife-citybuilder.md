# HarooVille — city-builder isométrique (première boucle jouable)

**Route principale :** `/haroolife/territoire`. L'ancien panneau cartographique et le quartier PlayCanvas restent à `/haroolife/territoire/carte`.

## Objectif produit

Passer d'une carte + boutons d'achat à un vrai jeu de construction et de gestion, dans l'esprit du genre Townsmen, avec une identité togolaise originale. Ne pas copier les images, noms commerciaux, sons ou ressources propriétaires d'un jeu tiers.

## Contenu livré

- Terrain de 22 × 22 cases en projection isométrique, forêts, zones d'eau, routes et mairie.
- Placement tactile : sélectionner une construction, toucher une case ; glisser pour déplacer ; boutons de zoom et de recentrage.
- 9 types de bâtiments : route, maison, scierie, champ de maïs, moulin, boulangerie, marché, puits, jardin.
- Conditions de construction : emplacement valide, route reliée à la mairie, fonds en FCFA **fictifs**, bois disponible, scierie à proximité d'une forêt.
- Une simulation journalière déterministe avec main-d'œuvre limitée : forêt → bois, ferme → maïs → moulin → farine → boulangerie → repas → habitants ; marché → revenus.
- Capacité de logement, nourriture consommée, satisfaction liée aux services, taxes, croissance et émigration lorsque la nourriture manque.
- Vitesse pause / normale / accélérée ; objectifs de mission ; inspection et démolition ; journal.
- Citoyens représentés visuellement sur les chemins (animation d'ambiance, **pas** encore une IA individu par individu).
- Sauvegarde versionnée locale du navigateur, restaurée et validée, sans serveur ni accès à des informations d'utilisateurs.

## Exclusion du réel

Ce mode n'a aucun accès aux transactions FedaPay, aux contrats Haroo, aux parcelles des coopératives ni aux tables Supabase métier. Les prix, emplois, récoltes, personnes et stocks sont uniquement ceux du jeu. Le seul état persistant est `localStorage` sur l'appareil du joueur.

## Limites assumées

Il s'agit d'une **première boucle city-builder jouable**, pas d'un remake complet du jeu Townsmen 5. Les graphismes sont dessinés procéduralement sur Canvas 2D et fonctionnent sur les appareils dépourvus de WebGL. Pas encore de chaînes de transport physiques, inventaire par bâtiment, saisonnalité, recherche, construction différée, météo ou PNJ avec véritable pathfinding.

## Tests et recette

```sh
node --import tsx --test tests/haroolife-townsmen-engine.test.ts
npm run test:hardening
npm run typecheck
npm run build
```

Sur Android : construire un champ à (12,11) après sélection du bâtiment ; vérifier que le jour suivant produit du maïs ; tester les bâtiments isolés, le glisser-déplacer, le zoom, la sauvegarde après rechargement et le mode accéléré.

Ne pas fusionner en production avant recette. Étapes suivantes : graphes de transport, séquences de construction, économie par entrepôts, PNJ avec emplois et routines, sprites/GLB originaux et cartes togolaises configurables.
