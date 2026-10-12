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

## Tranche 5 : ville nommée

- `lib/haroolife/lome-districts.ts` : la grille 22×22 est découpée en cinq quartiers nommés
  (nord, ouest, centre, est, sud) et deux plans d'eau. Lomé : Agoè, Adidogomé, Tokoin, Bè,
  Baguida ; lagune de Bè au nord-est, océan Atlantique au sud-ouest ; les berges sont en sable.
  Kara et Sokodé ont leurs propres quartiers, rivières et artère principale.
- Le HUD affiche le quartier où se trouve le personnage ; la carte propose des filtres
  (Tout, Commerces, Services, Maisons), la liste des quartiers avec une phrase chacun, et le
  choix de la ville. Changer de ville garde la grille, l'argent et la partie : seuls les noms
  changent (relevé géographique réel : tranche ultérieure). Les tuiles 3D prennent une teinte
  par quartier.

## Tranche 6 : surfaces de monétisation

- `lib/haroolife/lome-sponsors.ts` : cinq panneaux publicitaires (un par quartier, posés dans
  la scène 3D, cliquables) et six emplacements d'applis dans le téléphone (trois services
  FaîtiereHub gratuits, trois partenaires ouverts). Tarifs affichés : 15 000 à 25 000 FCFA la
  semaine de panneau, 50 000 FCFA le mois d'appli. Aucun annonceur inventé, aucune facturation :
  les emplacements libres renvoient vers la page contact. Résumé d'inventaire pour le dossier
  investisseur (`inventorySummary`), repris dans `investor-readiness/business-model.md` comme
  hypothèse.

## Tranche 7 : la ville entière (remplace le petit plateau)

Architecture en cinq couches, chacune dans son module :

| Couche | Fichier | Rôle |
|---|---|---|
| Monde urbain | `lib/haroolife/city/world.ts` | Grille 120×80, terrain (terre, sable, lagune de Bè, océan), six quartiers (Agoè, Adidogomé, Tokoin, Centre-ville·Dékon, Bè, Baguida), avenues tous les 12 et 10 cellules, rues de quartier selon la densité, boulevard de la plage, deux ponts, 46 lieux nommés et plus de 2 000 bâtiments générés de façon déterministe |
| Streaming | `lib/haroolife/city/chunks.ts`, `components/haroolife/city/city-chunks.tsx` | Chunks de 16×16 ; un maillage fusionné (couleurs par sommet) par chunk ; anneau proche détaillé (marquage, fenêtres, arbres) et anneau lointain simplifié ; construction progressive, destruction hors portée |
| Parcelle du joueur | `townsmen-engine.ts` inchangé, `EstateTiles` | La parcelle 22×22 est encastrée à Tokoin et reliée à l'avenue par une allée ; construction, économie et sauvegardes inchangées |
| Vie urbaine | `lib/haroolife/city/life.ts`, `navigation.ts`, `traffic.ts` | Position monde, chemins sur routes et ponts (BFS), entrée dans les lieux, actions par catégorie (repas, sport, culte, soins, cours, hôtel, banque, petit boulot), 24 véhicules et piétons sur une boucle de rues, migration des anciennes sauvegardes |
| Intérieurs | `lome-life-room-3d.tsx` | Salle de sport, lieu de culte et clinique ajoutés aux six intérieurs existants |

Interface : caméra aérienne libre (glisser, pincer, Q/E, recentrer, vue de la ville), sélection
au sol, icônes de lieux projetées au-dessus des bâtiments, filtres par catégorie, fiche de lieu
coulissante (activités, Y aller à pied, zémidjan, taxi, Entrer), statut et HUD inchangés.

Vérification : `tests/haroolife-city-world.test.ts`, `tests/haroolife-city-life.test.ts`, et
`e2e/lome-city.spec.ts` (390×844 et 1440×900) : chunks chargés, ≥ 250 bâtiments, analyse de
pixels interdisant qu'un plateau isolé occupe le centre d'une surface vide, caméra, fiche de
lieu, trajet, trois intérieurs, persistance au rechargement.

Résultats mesurés (exécution locale, Chromium swiftshader, build de production, 11 octobre 2026) :
6 scénarios Playwright passés (ville, vie, présence × desktop 1440×900 et Android 390×844).
Statistiques du monde au lancement : 35 chunks chargés, 2 062 bâtiments. Analyse de pixels du
centre de l'écran : desktop bleu 3 %, bâti 49 %, 666 teintes ; mobile bleu 4 %, bâti 52 %,
489 teintes (seuils : bleu < 30 %, bâti > 30 %, > 60 teintes). Captures dans
`test-results/lome-city/` (`*-city.png`, `*-overview.png`, `*-gym.png`).

Limites connues : la parcelle 22×22 reste visuellement lourde (carré de gazon) au milieu de
Tokoin ; le tracé des quartiers est simplifié et non issu d'OpenStreetMap ; Kara et Sokodé
réutilisent la même disposition ; la présence des comptes réels reste limitée à la parcelle.

## Phase 2 : le monde vivant (qualité, diversité, animation, interactivité)

Objectif : passer des volumes extrudés à un vrai simulateur de vie. Rien du moteur n'est
reconstruit ; la grille, les chunks, les routes, les sauvegardes et l'économie sont inchangés.

| Chantier | Ce qui est livré | Fichiers |
|---|---|---|
| Catalogue de bâtiments | 72 modèles Kenney CC0 cuits en couleurs par sommet (14 immeubles commerciaux, 21 maisons, auvents, clôtures, lampadaires, étals, 9 véhicules, arbres). Chaque parcelle reçoit un modèle, une orientation vers sa porte, une échelle ajustée à l'emprise et une teinte déterministes ; mosquées (dôme, minarets), églises (clocher, croix), hôpitaux (croix, ambulance), marchés (auvents rayés, étals de fruits et de pain), stades (pelouse, tribunes), ports (ponton, pirogues), stations (taxis garés), écoles et mairies (drapeaux, enseignes). Jamais plus de 20 % de la ville sur le même modèle. | `scripts/haroolife-bake-models.mjs`, `lib/haroolife/city/pack.ts`, `lib/haroolife/city/catalogue.ts`, `components/haroolife/city/model-bank.ts` |
| Environnement urbain | Trottoirs le long des parcelles, passages piétons aux carrefours, lampadaires et arbres sur les avenues, cocotiers sur le littoral, murs de concession avec portail côté porte, enseignes, niveau de détail lointain avec toits à pignon, parapets, dômes et clochers | `components/haroolife/city/city-chunks.tsx` |
| Intérieurs | Plans de pièces en données : salle de sport (3 tapis de course, 2 vélos, 2 bancs de musculation, râtelier d'haltères, tapis de yoga, miroir, 3 casiers, 2 douches, toilettes, accueil, fontaine à eau, plantes), maison, commerce, bureau public, lieu de culte, clinique, jardin. Chaque équipement est un objet 3D cliquable ; mobilier Kenney (lit, douche, toilettes, bureau, ordinateur, plantes) | `lib/haroolife/city/interiors.ts`, `components/haroolife/city/interior-scene.tsx` |
| Personnages animés | Kenney Mini Characters (squelette et 32 clips : idle, walk, sprint, sit, crouch, holding…) via le composant `anim` de PlayCanvas ; PNJ en salle (coach à l'accueil, coureuse sur tapis, haltérophile, yogi, cliente vers les vestiaires), au marché, au bureau, au culte, à la clinique, au jardin ; piétons de la ville sur de vrais trajets porte à porte (48 itinéraires, BFS sur les rues) ; véhicules de 9 types sur la boucle de rues. Le joueur marche (walk) ou court sur le tapis (sprint). Les PNJ sont étiquetés « personnages du jeu (pas de vrais joueurs) ». | `components/haroolife/city/character.tsx`, `lib/haroolife/city/traffic.ts` |
| Jour et nuit | Soleil, ciel et lumière ambiante suivent l'heure de la partie (aube et crépuscule dorés, nuit bleue) | `daylight()` dans `city-world.tsx` |
| Gameplay | Condition physique (0–100) ; tapis de course, vélo, musculation, yoga, coach, douche, toilettes ; coût, énergie, hygiène, loisir ; animation du joueur sur l'équipement choisi pendant 3 s ; sauvegarde compatible (champ `fitness` absent → 0) | `lib/haroolife/city/life.ts` |
| Interface | Puces de catégories au-dessus de la ville (Tous, Maisons, Commerces, Éducation, Santé, Transport, Services, Loisirs, Cultes), étiquettes nommées projetées sur les lieux, surbrillance au sol du lieu choisi, fiche de lieu (activités, personnages sur place, choix d'une activité, cartes À pied / Zémidjan / Taxi avec durée estimée), bouton « Activités · <lieu> » à l'intérieur | `components/haroolife/lome-life-immersive.tsx` |

Vérification : `tests/haroolife-city-catalogue.test.ts` (pack décodable, catalogue déterministe et
ajusté aux emprises, repères habillés selon leur nature, mobilier urbain, intérieurs meublés,
tapis de course : énergie −15, forme +6, −500 FCFA) et `e2e/lome-world-life.spec.ts`
(parcours complet en 11 étapes sur 1440×900 et 390×844, circulation autonome, nuit).

## Jalon 2 : acteurs réels et coopératives (12/10/2026)

HarooLife devient l'interface spatiale des comptes FaîtiereHub / Haroo. La couche métier
(`lib/haroolife/domain/`) ne dépend pas du rendu : PlayCanvas ne connaît que l'adaptateur.

### Couche domaine

- `actor.ts` : `Actor` par composition (rôles `haroolife_world`, type Haroo, organisations,
  arbre administré, compétences, disponibilité, cartes, parcelles) ; `capabilitiesOf()` dérive les
  capacités (un agronome non validé n'organise pas d'équipe ; sans organisation, pas d'entrée en
  coopérative) ; facettes `ProducerActor`, `WorkerActor`, `BuyerActor`, `AgronomistActor`,
  `CooperativeActor`, `UnionActor`, `FederationActor`, `OperatorActor`, `ServiceProviderActor`.
- `bus.ts` : `DomainCommandBus` (Command pattern, résultat `{ ok }` jamais d'exception) et
  `DomainEventDispatcher` (`WorkerGroupCreated`, `WorkerJoined`, `WorkerLeft`, `WorkerGroupReady`,
  `WorkerGroupExpired`, `LandPledged`, `CooperativeEntered`).
- `worker-group.ts` : cycle `DRAFT → OPEN → READY → CONFIRMED → ACTIVE → COMPLETED` (+ `CANCELLED`,
  `EXPIRED`), dérivé des lignes `haroolife_groups` existantes ; `canJoin` exige le rôle ouvrier,
  la disponibilité et le consentement.
- `land-aggregation.ts` : `validatePledge` reflète les gardes SQL de `haroolife_command`
  (plafond du pilote, pas de double engagement d'une parcelle, même coopérative, unités en ha).
- `cooperative.ts`, `services.ts` (`ActorRegistry` avec TTL, `GameWorldAdapter` qui affecte un
  bâtiment à une organisation de façon stable, `AvatarRenderer`), `http.ts` (adaptateurs HTTP).

### API (lecture seule, compte requis, `Cache-Control: private, no-store`)

| Route | Accès | Contenu |
|---|---|---|
| `GET /api/haroolife/me` | connecté | l'acteur : rôles réels, organisations et lignée, cartes existantes (statut calculé par `computeCardStatus`), jamais de contact |
| `GET /api/haroolife/cooperatives/[id]` | membre, admin de l'arbre, super_admin | effectif exact (`count: exact`), répartition par statut, superficie et cultures (`parcelles`), annonces, équipes et regroupements du pilote, présence réelle (résidents visibles membres) |
| `GET /api/haroolife/cooperatives/[id]/members` | administrateurs seulement (403 sinon) | 20 par page côté serveur, recherche `ilike` sur prénom/nom, noms publics « Prénom I. » |

### Dans la ville

- Six « Maisons des coopératives » (type `cooperative`, catégorie Services, intérieur `hall`).
- Bouton « Ma coopérative » (HUD et panneau Maison) : la caméra vole vers le bâtiment de
  l'organisation, la fiche indique « Ici siège : … » ; « Entrer dans la coopérative » ouvre le
  tableau de bord spatial ; les organisations liées (union, faîtière, coopératives filles) se
  parcourent sans quitter le bâtiment, les frontières restant vérifiées par l'API.
- 120 membres ne produisent pas 120 modèles : les avatars restent les résidents visibles et
  consentants ; la liste nominative est paginée et réservée aux administrateurs.

### Vérification

- `tests/haroolife-domain.test.ts` (capacités, cycle de vie, gardes de promesse, pagination).
- `e2e/lome-cooperative.spec.ts` (desktop 1440×900 et Pixel 7) : bouton → caméra déplacée →
  taxi → entrée → tableau de bord (COOMARA-Kpalimé, lignée, 120 membres, cultures, équipe,
  regroupement) → liste page 1/6 → page 2 → recherche « Abalo » (12) → union ; absence de
  numéros de téléphone ; API 401 sans session, 400 sur identifiant invalide.
  Captures : `test-results/lome-cooperative/*.png`.
- Mock Supabase versionné dans `e2e/fixtures/mock-supabase.mjs` (120 membres, 40 parcelles,
  groupes, résidents, `offset`/`limit` de postgrest-js honorés).

### Non opérationnel à ce jalon

- Aucune mesure sur appareil Android réel ; aucune préversion Vercel `haroolife-lome` depuis
  cette session (projet non visible du compte connecté ici).
- Le marché (préventes) et les formulaires « Recruter une équipe » / « Regrouper nos
  superficies » ne sont pas encore branchés dans le panneau (Jalon 3).
- Pas de carte de membre délivrée depuis le jeu : la fiche renvoie vers `/verify/<numéro>`
  des cartes existantes uniquement.

## Jalon 3 : agrégation et interactions (12/10/2026)

### Moteur d'interaction (`lib/haroolife/domain/engine.ts`)

`createInteractionEngine({ teams, land, parcels })` enregistre les commandes sur le
`DomainCommandBus` ; chaque bâtiment est un point d'interaction qui envoie une commande, jamais
une écriture directe :

| Commande | Capacité exigée | Vérifications côté client (miroir) | Service réel |
|---|---|---|---|
| `RecruitTeam` | producteur, admin de coopérative ou agronome validé (`canRecruit`) | titre ≥ 3, fin ≥ début | `haroolife_command` `create` (`team`) |
| `JoinTeam` | `join-team` | `canJoin` : profil ouvrier, disponible, équipe ouverte, pas déjà membre, places restantes | `join` |
| `LeaveTeam` | — | — | `leave` |
| `PledgeLand` | `join-land-group` | `validatePledge` : regroupement ouvert, parcelle à soi, surface > 0 à 4 décimales, ≤ parcelle, ≤ plafond, pas déjà participant | `join` avec `parcel_id` et `amount` (ha) |
| `OpenLandPool` | `join-land-group` | parcelle à soi, 0 < surface ≤ parcelle, titre, dates | `create` (`work`) avec première promesse |
| `EnterCooperative` | `enter-cooperative` | rattachement ou `browse-hierarchy` | événement seulement |

Les unités (`ha`, `are`, `m²`) sont converties en hectares à 4 décimales comme la base ; aucune
somme n'est faite côté client, seul `total` renvoyé par `haroolife_board` compte. Les événements
`WorkerGroupCreated`, `WorkerJoined`, `WorkerLeft`, `WorkerGroupReady`, `WorkerGroupExpired`,
`LandPledged`, `CooperativeEntered` alimentent la notice du HUD.

### Dans la maison des coopératives

- « Recruter une équipe » (formulaire : titre, activité, dates, bénéficiaire) → le groupe apparaît
  avec son effectif réel 0/8 ; « Rejoindre / Quitter l'équipe » pour un ouvrier disponible, sinon
  la raison est affichée (« Profil ouvrier requis. »), jamais un bouton qui échouerait.
- « Engager une parcelle » sur un regroupement ouvert (parcelle, surface, unité) et « Regrouper nos
  superficies » (nouveau regroupement avec première promesse). Scénario validé : regroupement
  de 15 ha à 12,5 ha, promesse de 2 ha refusée sur une parcelle de 0,5 ha, acceptée sur une
  parcelle de 2 ha → 14,5 / 15 ha, 3 participants, plus de bouton pour le même compte.
- Les actions ne sont proposées que dans sa propre organisation ; le serveur revérifie tout.

### Marché

`GET /api/haroolife/market` (compte requis, filtres `culture` / `canton`) assemble les préventes
Haroo `DISPONIBLE` et les annonces de producteurs de type `prevente` actives, en FCFA/kg et kg,
sans aucun numéro de téléphone (la mise en relation renvoie vers `/haroo` ou `/marketplace`).
Dans un marché de la ville : « Voir les offres de producteurs » ouvre la fiche « Marché » avec
filtres par culture.

### Parcours d'accueil et cartes

Le panneau Maison affiche le parcours d'accueil du compte réel : compte, organisation, canton,
profil Haroo, carte (statut calculé par la règle commune, lien `/verify/<numéro>`), chacun
renvoyant vers l'écran existant qui le complète. Le jeu ne crée ni compte, ni adhésion, ni carte.

### Correctif trouvé en route

`POST /api/haroolife` comparait l'en-tête `Origin` à `request.nextUrl.origin`, qui vaut
`http://localhost:3000` derrière `next start --hostname 127.0.0.1` : toute commande depuis le
navigateur était refusée (« Origine invalide ») dans ce banc. La comparaison se fait maintenant
avec l'hôte réellement utilisé (`Host` / `X-Forwarded-Host`), toujours en même origine.

### Vérification

- `tests/haroolife-engine.test.ts` : scénarios A (recrutement, 8 adhésions, prêt, refus du
  non-ouvrier, de l'indisponible, du doublon, du 9ᵉ), B (15 ha, 2 ha acceptés, ares et m²,
  dépassement de parcelle et de plafond, double engagement, double participation, capacité
  manquante), C (frontières d'organisation), D (ouverture d'un regroupement avec première
  promesse).
- `e2e/lome-cooperative.spec.ts` (desktop et Pixel 7) : scénarios A et B dans le bâtiment avec
  le mock Supabase (commandes réelles via `/api/haroolife`, réinitialisées par `POST /__reset`),
  marché (3 offres, filtre Soja → 2, « Déjà vendu » absent, aucun numéro).

### Non opérationnel à ce jalon

- Les états `CONFIRMED`, `ACTIVE`, `COMPLETED` restent dérivés des dates : aucune table de
  production n'est modifiée (pas de migration).
- Pas de création de prévente depuis le jeu ; pas de mesure sur Android réel ; préversion Vercel
  non vérifiable depuis cette session.
