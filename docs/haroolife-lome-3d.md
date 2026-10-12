# HarooLife — Lomé Life 3D

Simulation de vie et de ville jouable dans le navigateur, en 3D, dans un quartier
fictif de Lomé. Route : `/haroolife/territoire/lome` (lien « Lomé Life 3D » dans
l'en-tête de `/haroolife`). Mode fictif : aucune écriture vers les comptes, cartes,
parcelles ou paiements réels ; sauvegarde locale dans le navigateur.

## Inventaire : ce qui existait déjà

| Brique | Fichier | État |
|---|---|---|
| Moteur ville (grille 22×22, ressources, construction, routes reliées à la mairie) | `lib/haroolife/townsmen-engine.ts` | opérationnel, testé |
| Moteur vie (besoins, métiers, salaires FCFA, commerces, transports, journée) | `lib/haroolife/lome-life-engine.ts` | opérationnel, testé |
| Rendu 3D PlayCanvas + modèles Kenney CC0 (bâtiments, arbres, voitures, mobilier) | `components/haroolife/city-world-3d.tsx`, `lome-life-room-3d.tsx` | opérationnel |
| Interface immersive mobile (HUD besoins, panneaux Maison / Acheter / Carte / Téléphone) | `components/haroolife/lome-life-immersive.tsx` | opérationnel |
| Chemin le plus court sur les routes (port TypeScript de SimCity-three.js) | `lib/haroolife/vendor/simcity-road-path.ts` | opérationnel, testé |
| Facteurs de zoom caméra (house-builder) | `lib/haroolife/vendor/house-builder-camera-zoom.ts` | opérationnel |

Ces briques venaient de la branche `feat/haroolife-lome-immersive-mobile-ui`
(PR #21, fermée sans fusion). Elles sont reprises telles quelles sur `main`, qui
contient par ailleurs HarooLife Togo (village isométrique SVG, données réelles).
Les deux cohabitent : le village SVG reste sur `/haroolife`, la 3D sur sa route.

## Les trois dépôts analysés (11/10/2026)

| Dépôt | Licence | Pile | Réutilisé |
|---|---|---|---|
| `dgreenheck/simcity-threejs-clone` | MIT (fichier LICENSE + README) | Three.js 0.155, Vite, ~3 500 lignes JS, pas de tests | Recherche de voisins / BFS de `sim/city.js`, déjà portée en TypeScript pur. Le graphe de véhicules (`sim/vehicles/*`, ~780 lignes) est couplé à Three.js : non copié, remplacé par une boucle sur le réseau routier existant. |
| `ch-bas/threejs-sims-house-builder` | MIT (fichier LICENSE) | Next 15, React 18, Three.js 0.186, zustand, vitest (95 fichiers de test), ~54 000 lignes | Seuls les facteurs de zoom caméra (`camera-zoom.ts`), déjà vendorisés. Le reste dépend de Three.js et d'un store zustand absent du projet. |
| `silverlion2/simlife` | README dit MIT, `package.json` dit ISC, pas de fichier LICENSE | Phaser 4, plugins Rex, Electron 41, ~13 700 lignes JS, tests Playwright | Rien : licence ambiguë, moteur Phaser incompatible avec PlayCanvas. Les idées (besoins, autonomie, carrières) ont inspiré du code original. |

Aucune ressource propriétaire n'est copiée : les modèles 3D sont les kits Kenney
(CC0), les intérieurs sont assemblés en géométrie PlayCanvas. Attribution complète
dans `lib/haroolife/vendor/THIRD_PARTY_NOTICES.md` et `public/haroolife/models/CREDITS.md`.

**Pourquoi rester sur PlayCanvas.** Le projet embarque déjà `playcanvas` et
`@playcanvas/react`, les modèles GLB et le rendu. Ajouter Three.js pour les trois
dépôts aurait doublé le poids des moteurs 3D sans gain : leurs parties utiles sont
de la logique pure (chemins, zoom) et sont réutilisées sans leur runtime.

## Boucle de jeu livrée

1. **Caméra isométrique orientable** : rotation par pas de 45° (bouton, touches Q/E),
   zoom (boutons, +/−), déplacement par glisser.
2. **Personnage contrôlable** : flèches ou WASD sur ordinateur, pavé directionnel
   à l'écran sur mobile, une case de route par pas ; ou toucher un lieu pour un
   trajet automatique suivant les routes. Face à une porte, « Entrer » ouvre
   l'intérieur 3D du lieu.
3. **Bâtiments accessibles** : maison (dormir, manger, se laver), marché et
   boulangerie (acheter un repas), mairie (service), puits, jardin.
4. **Besoins quotidiens** : faim, énergie, hygiène, social ; baisse horaire,
   alertes critiques, humeur affichée.
5. **Emplois et revenus** : vendeur, boulanger, agent communal ; un service par
   jour, entre 7 h et 19 h, sur le lieu de travail ; salaire en FCFA fictifs payé
   par la caisse municipale (budget distinct du portefeuille personnel).
6. **Commerces** : repas à 650 FCFA, stock municipal décrémenté, recette encaissée
   par la ville.
7. **Circulation et économie** : taxi, berline, fourgon et piéton parcourent le
   réseau routier case par case (boucle déterministe sur les routes reliées à la
   mairie), même quand le joueur est immobile ; production, consommation et
   population recalculées à chaque nouveau jour.
8. **Construction** : route, maison, marché, boulangerie, champ, moulin, scierie,
   puits, jardin ; pose sur le terrain 3D, démolition, règles de raccordement.

## Ce qui n'est pas dans cette tranche

- Pas de données réelles ni de multijoueur : personnages non joueurs scénarisés.
- Pas de véhicule pilotable : les transports payants accélèrent le trajet.
- Pas de sauvegarde serveur : `localStorage` seulement.
- La ville est un quartier générique inspiré de Lomé, pas un relevé géographique.

## Vérification

```bash
npm run typecheck
npm run test:unit            # inclut lome-life, lome-immersive, townsmen, road-path
HAROOLIFE_ENABLED=true NEXT_PUBLIC_HAROOLIFE_ENABLED=true \
  npx playwright test --config=e2e/lome-life-playwright.config.ts
```

Le scénario Playwright construit l'application, puis joue sur ordinateur
(1440×900) et sur Android (Pixel 7) avec WebGL2 réel (SwiftShader) : pavé
directionnel et clavier, trajet automatique vers le marché, achat et repas,
service payé, entrée dans un intérieur 3D, mode construction. Captures dans
`test-results/lome-visual/`.

## Tranche 2 : événements à choix et six besoins

- Six jauges : faim, énergie, hygiène, social, loisir, toilettes. Nouvelles actions « Se détendre »
  (maison ou jardin) et « Toilettes » (maison, mairie, marché). Les anciennes sauvegardes se chargent
  avec des valeurs par défaut.
- Événements du quartier (`lib/haroolife/lome-events.ts`) : rue inondée à Bè, coupure CEET, grand
  marché fermé, grève des zémidjans, fête de quartier. Tirage déterministe par (jour, heure), de jour
  seulement, jamais en déplacement ; chaque événement propose deux choix aux conséquences affichées,
  et les dépenses passent par le portefeuille fictif vers la caisse municipale.

## Tranche 3 : présence réelle des comptes

- Le quartier 3D lit `/api/haroolife/world` (même API que le village SVG) : les habitants du canton
  du compte connecté apparaissent dans la scène, chacun près du bâtiment de son rôle
  (`lib/haroolife/lome-presence.ts` : producteur au champ, acheteur au marché, coopérative et
  opérateur à la mairie, agronome au point d'eau, ouvrier au jardin), avec un socle à la couleur
  de son pagne. Aucune donnée de contact.
- En entrant dans un lieu, « Ici maintenant » liste les personnes attachées à ce lieu.
- L'appli Messages du téléphone devient la place du canton : messages réels des habitants,
  envoi via `/api/haroolife/say` (200 caractères, cadence en base). Sans compte ou si HarooLife
  est désactivé, le jeu reste jouable seul avec le personnage scénarisé.

## Tranche 4 : scène de trajet

- Un transport payant (zémidjan ou taxi) ouvre une scène de trajet dans la même application
  PlayCanvas (`components/haroolife/travel-scene-3d.tsx`) : boulevard du Mono vu de derrière le
  véhicule, circulation dépassée, lampadaires et concessions qui défilent. Pluie réelle d'après
  la météo Open-Meteo du canton (probabilité ≥ 50 %) ; ciel et bitume changent avec.
- Durée : quelques secondes, proportionnelle au trajet ; « Passer » pose le personnage à
  destination (`skipTravel`), « Carte » revient au quartier. Pas de second contexte WebGL.
