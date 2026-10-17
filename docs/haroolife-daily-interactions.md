# HarooLife — assise et repas, premiers parcours complets

17 octobre 2026. Périmètre : une assise de référence à la maison et un repas au marché. L’économie réelle FaîtiereHub, les comptes et les tables Supabase ne changent pas.

## Parcours livrés

- À la maison, toucher la chaise : marche jusqu’à une entrée libre, animation d’assise, puis maintien de la posture. Le bouton « Se lever » joue le relevage avant de rendre la marche. Un mouvement ou une autre destination demande également le relevage.
- Au marché, toucher le comptoir et commander l’ayimolou : paiement unique, portion ajoutée au sac, déplacement vers une chaise accessible, assise, bol et cuillère visibles. Le geste lève la main à la bouche. Le personnage reste assis après son repas.
- Depuis Mon sac, manger une portion achetée ou un ancien repas du domaine. Dans la rue, la même action produit une animation debout.
- La scène reste visible : un panneau compact indique l’installation, la progression et l’interruption. La caméra intérieure se rapproche pendant l’activité puis revient à son cadrage normal.

L’eau et le savon gardent leur consommation existante ; cette livraison ne prétend pas ajouter une animation de boisson. Les intérieurs partagés entre plusieurs joueurs et la réservation serveur des sièges appartiennent à une étape distincte.

## Animation et modèles

Les quatre GLB adultes, leurs maillages, matériaux, squelettes et six animations originales sont conservés. Quatre animations d’assise sont ajoutées : `HarooSitEnter`, `HarooSitIdle`, `HarooSitExit`, `HarooSitTalk`.

Source : [Quaternius Universal Animation Library Standard](https://quaternius.itch.io/universal-animation-library), archive gratuite du 16 juin 2026. Clips d’origine : `Sitting_Enter`, `Sitting_Idle_Loop`, `Sitting_Exit`, `Sitting_Talking_Loop`. Licence CC0 : `public/haroolife/assets/licenses/quaternius-UAL-CC0.txt`.

SHA-256 de l’archive téléchargée : `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724`.

`scripts/haroolife-bake-daily-animations.mts` adapte ces clips aux quatre squelettes. Il prend le GLB UAL et un répertoire de GLB originaux. Les originaux peuvent être extraits du commit `f6ed6ef2`. Il refuse des entrées contenant déjà les clips HarooSit pour éviter les doublons. L’archive entière n’est pas servie au navigateur.

Les rigs diffèrent : noms des os, pose de référence en A au lieu de T, et pieds rattachés directement à Root. L’adaptation traite ces différences ; renommer les clips ne suffirait pas. Une correction cinématique à deux articulations pose les pieds au sol en respectant la longueur des jambes et le contact du bassin avec le siège.

`daily-animations.ts` crée les gestes de repas sur les rigs existants. Il fournit une version debout et une version assise, sans remplacer le personnage. Le bol, la portion et la cuillère sont des objets 3D appartenant à l’instance, rattachés aux mains et libérés à la destruction de l’acteur.

Les transitions d’assise se jouent une fois ; la pose assise boucle jusqu’à une demande du joueur. Le minuteur historique de 3,2 secondes reste pour les autres activités, mais ne coupe plus l’assise ou le repas.

## Placement et collisions

`RoomScene.seats` décrit le point d’assise, sa hauteur, sa direction et son entrée/sortie libre. La maison possède sa chaise de référence ; le marché dispose de deux places autour d’une table. Les places de PNJ assis sont exclues.

Le chemin d’approche utilise les obstacles existants. La transition finale n’autorise que le contact prévu avec le siège ; elle n’active pas une marche libre à travers le mobilier. Le relevage se termine sur le point libre avant une nouvelle marche. Une sortie devenue bloquée refuse le relevage et affiche une explication.

L’occupation est locale au joueur et aux PNJ. Il n’y a pas de réservation multijoueur présentée comme déjà synchronisée.

## Paiement, portion et sauvegarde

`city/dining.ts` est indépendant du rendu :

1. `beginMeal` achète éventuellement une portion, une seule fois, puis prépare une interaction identifiée.
2. Le moteur confirme l’installation avec `readyMeal`.
3. Les seules images effectivement affichées au premier plan font avancer le repas. La première bouchée, après 1,4 seconde, retire une portion et applique les besoins une fois. Le repas dure 6 secondes de premier plan.
4. Une interruption avant la première bouchée laisse la portion dans le sac. Après celle-ci, la portion entamée reste consommée.
5. Les doublons d’identifiant, clics répétés et anciens callbacks ne répètent ni paiement ni consommation.

L’interaction est transitoire : `decodeCityLife` ne restaure ni repas en cours ni siège occupé. Les achats déjà effectués et les effets déjà validés restent sauvegardés. Le retour d’un onglet masqué est plafonné ; il ne termine pas un repas hors ligne.

Les portions historiques `life.meals` sont présentées dans le même sac que les articles `commerce.inventory`, sans migration destructive. Leur consommation utilise les règles d’origine, y compris le trait Gourmand et l’effet sur la vessie.

## Intégration dans l’architecture

Le rendu de référence reste le moteur Three.js Haroo existant. Les scènes maison, marché et boulangerie passent par ce contrôleur commun, y compris lorsqu’un ancien appareil a mémorisé la préférence R3F. Les autres scènes conservent le choix de moteur et la préférence stockée n’est pas effacée.

Le catalogue et les clips sont partagés avec le composant R3F. Les transports, le trafic, les régions, les métiers, les invitations, le logement, les utilisateurs et les sauvegardes restent dans leurs modules existants. Aucun changement de schéma ni secret supplémentaire requis.

## Validation

Les tests vérifient : paiement et portion uniques, première bouchée, interruption, rechargement, anciens stocks, sortie d’un lieu, pieds au sol, main arrivant à la bouche, absence de régression des rigs de conduite et de vélo, places accessibles et continuité avec les préférences de rendu historiques.

Les scénarios navigateur utilisent les fixtures Supabase locales. Ils n’envoient pas de messages à des utilisateurs réels et ne modifient pas les comptes de production.
