# HarooLife — territoire national et simulation (phase 1)

## Objectif
Conserver **le pilote réel HarooLife** (équipes, parcelles et autorisations Supabase) et lui adjoindre un **bac à sable économique indépendant** sur une carte navigable du Togo : `/haroolife/territoire`.

L'économie, les stocks, les prix et les investissements affichés sont **fictifs**. Aucun appel de ce module ne modifie les tables `haroolife_*`, les parcelles, comptes utilisateurs, paiements, annonces ou contrats. Le bac à sable ne crée aucun engagement réel.

## Architecture réalisée
- Next.js : route App Router dédiée et interface responsive.
- Leaflet (déjà installé dans Saas) : carte web interactive avec cinq localités ; centre et marqueurs sont des repères géographiques, **pas** une cartographie exhaustive.
- Modèle TypeScript pur `lib/haroolife/territory-simulation.ts` : pas de hasard, transitions journalières, coût des équipements, stocks en kg, transformation à rendement de démonstration et vente conditionnelle au transport.
- Aucun schéma Supabase, aucun service serverless et aucune variable secrète ajoutés.
- L'existant `components/haroolife/village-3d.tsx` (PlayCanvas) reste inchangé ; le jeu peut devenir progressivement un vrai monde 3D.
- Les données de la simulation sont **en mémoire de l'onglet uniquement**, sans sauvegarde ; la réinitialisation recharge les valeurs initiales.

## Démarrage et tests
```sh
node --import tsx --test tests/haroolife-territory-simulation.test.ts
npm run typecheck
npm run build
```
Sur une branche de revue, ouvrir `/haroolife/territoire` et contrôler le rendu tactile Android et le clavier. Le pilote `/haroolife` continue de fonctionner avec les mêmes autorisations et drapeaux.

## Carte et données
Le démonstrateur utilise des tuiles OpenStreetMap publiques avec attribution via Leaflet. Leur utilisation doit rester conforme à la politique des serveurs : **pas de téléchargement massif, pas de garantie de disponibilité**. Avant une ouverture à fort trafic, remplacer les tuiles par un fournisseur autorisé ou du PMTiles auto-hébergé et ajouter les attributions de chaque jeu de données.

**Étape cartographique suivante** : remplacer la simple carte de points par MapLibre + tuiles PMTiles issues d'OpenStreetMap/Geofabrik, limites administratives vérifiées (geoBoundaries) et bâtiments/profil altimétrique documentés. Convertir la carte nationale en système de sélection des zones puis transmettre les coordonnées locales à PlayCanvas. Ne pas importer Three.js en doublon tant que PlayCanvas suffit.

## Moteur de simulation — évolution
Isoler un moteur d'entités/composants/systèmes (ECS) dans un Web Worker. Stocker des snapshots versionnés, faire calculer le serveur pour le multijoueur et ne jamais considérer une simulation cliente comme source d'autorisations ou de transactions réelles. Les villes éloignées seront agrégées ; seuls les objets visibles seront animés en 3D.

Étapes recommandées :
1. Étendre l'économie fictive à plusieurs villes/produits, vérifier chaque circuit matière/monnaie, tests d'invariants.
2. Ajouter sélection de territoires réels et prétraitement géospatial.
3. Liaison optionnelle en lecture seule aux métiers Haroo/FaîtiereHub avec permissions et consentement ; ne jamais exposer les données privées sur la carte publique.
4. Chargement progressif d'assets GLB optimisés (Blender → PlayCanvas), puis trafic et habitants dans un Web Worker.
5. Sauvegardes séparées avec RLS, restauration fiable et multijoueur autoritaire.

Ne pas lancer de migrations ou déploiement en production sans revue et recette du pilote.


## Phase 2 — premier quartier PlayCanvas (prévisualisation)

Le client affiche maintenant une scène 3D à l'entrée de `/haroolife/territoire`, avant la carte Leaflet :

- Cinq **quartiers stylisés distincts** suivent la ville choisie via la carte ou les boutons. Les coordonnées des repères de ville sont géographiques, **pas** les positions, dimensions ou bâtiments de la scène 3D.
- Une caméra orientable par boutons (contrôle tactile accessible), un chemin, des commerces et de petits personnages animés donnent une première vue d'un monde vivant. Ce n'est **pas** encore une simulation de déplacements routiers réels ni une économie multi-agent.
- Les achats dans le moteur déterministe changent les visuels de Kpalimé : parcelles irriguées, usine, panneaux solaires et camion. Lomé affiche un signal de livraison après une vente simulée.
- Un panneau de construction utilisable au clavier et au doigt évite de dépendre du raycast WebGL seul.
- Le composant PlayCanvas est importé dynamiquement et uniquement côté navigateur. Sans WebGL2, le jeu économique et la carte restent utilisables. Économie de données / faible RAM : scène désactivée au départ mais activable manuellement ; bouton de mode léger pour libérer le rendu.
- Les mises à jour visuelles sont limitées à ~10 par seconde et suspendues lorsque l'onglet est masqué ; `prefers-reduced-motion` coupe l'animation.

**Aucune géométrie cadastrale, parcelle privée, donnée d'habitant ou topologie routière n'est exportée dans la scène.** Une zone 3D ne déclenche aucune opération Supabase. Toutes les dépenses de construction sont des chiffres fictifs du scénario local.

### Vérifications 3D
```sh
node --import tsx --test tests/haroolife-territory-scene.test.ts
npm run test:hardening
npm run typecheck
npm run build
```

Recette manuelle : sous Android, ouvrir Kpalimé, acheter l'usine, l'irrigation, le camion et les panneaux ; vérifier les changements graphiques, faire défiler les jours, choisir Lomé sur la carte et observer l'arrivée des produits. Puis vérifier un navigateur sans WebGL2 et le mode léger. Garder la PR en brouillon jusqu'à validation mobile.

**Prochaine phase, non encore implémentée :** réseau routier OSM → graph de transport, PMTiles, assets 3D de qualité sous licence adaptée (Blender/GLB), vrais agents autonomes avec moteur ECS/Web Worker, sauvegardes versionnées, puis concurrence multijoueur côté serveur.
