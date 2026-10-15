# HarooLife : diagnostic des cartes et des interactions

Références : captures LagosLife fournies (vue générale, aéroport, panneaux, trajet, salle de sport et téléphone) et `HAROOLIFE_V3_KITS_CARTE_ET_PROMPT.zip`. Base de travail : `main` après les PR 43/44 et les commits `4635a097`, `46a92154`.

## Ce qui tourne réellement

`app/haroolife/layout.tsx` garde le jeu monté entre les routes. `LomeLifeImmersive` porte les parcours et la sauvegarde ; PlayCanvas dessine les rues et la carte ; React Three Fiber dessine les intérieurs par défaut. Le monde possède ses localités, ses lieux déterministes, ses portes et ses routes. L'intégration ne crée ni moteur ni carte métier supplémentaire.

La carte ne lisait pas les 213 GLB ajoutés : elle chargeait toujours `public/haroolife/city/kenney-pack.*`. Ce pack contient déjà une sélection Kenney. Ajouter des fichiers dans `public/` ne change donc pas la composition affichée. Le pack actif a été reconstruit depuis les quatre collections fournies ; les véhicules, meubles de marché et arbres absents du ZIP sont repris à l'identique dans l'ancien pack. Les modèles statiques de personnages en sont retirés. Les GLB bruts restent hors du chargement initial.

## Écarts observés et corrections

| Écart aux références | Cause confirmée | Correction |
| --- | --- | --- |
| Icônes rares, décalées et touchers imprécis selon la qualité | Les fonctions caméra PlayCanvas prennent des pixels CSS ; le code appliquait le ratio du tampon graphique une deuxième fois | Projection et picking en pixels CSS, indépendants de la résolution, collision des marqueurs avec marge et priorité au lieu sélectionné |
| Filtre Maisons sans destinations | Il interrogeait uniquement les repères nommés, sans les parcelles résidentielles | Les catégories Maisons/Terrains interrogent les parcelles existantes, avec le même plafonnement et la même collision des marqueurs |
| Fermer une fiche ou toucher un bouton pouvait agir sur le sol | Le gestionnaire global `pointerup` acceptait des pointeurs jamais commencés sur le canvas | Vérification du pointeur propriétaire ; annulation système sans sélection ; pincement reconnu comme geste |
| Glissement susceptible de s'interrompre | Les callbacks caméra recréaient les écouteurs pendant le geste | Écouteurs conservés et callbacks actualisés par référence ; molette ajoutée sur ordinateur |
| Joystick et bouton Entrer dans une vue très éloignée | Le bouton de survol modifiait seulement la caméra et pas le mode carte | Boutons de survol et de recentrage reliés aux transitions existantes ; clavier neutralisé pendant l'exploration |
| Cadrage instable | Mélange de coordonnées de cellules et de coordonnées de scène lors du cadrage/pan | Conversion explicite via `worldPos` ; angle de jeu mémorisé puis restauré |
| Carte trop oblique et peu lisible | Même présentation que la vue de déplacement | Vue de carte orientée vers le nord au départ, inclinaison dédiée, recul quartier plus grand ; éclairage de lecture distinct du cycle de la rue |
| Bâtiments trop tassés et silhouettes hautes répétées | Les bâtiments remplissaient les parcelles ; les immeubles anonymes utilisaient des modèles hauts | Cours/jardins autour des volumes ; immeubles ordinaires abaissés ; repères nommés conservés. Emprise cumulée des bâtiments principaux sur les parcelles : environ 40 % → 25 %. Nombre de bâtiments principaux dépassant 4 unités : 21 → 1 |
| Sol interrompu lors du survol | Rayon lointain indépendant du recul de la caméra | Extension des seuls volumes et sols lointains selon le recul ; budgets des modèles détaillés conservés |
| Carte de jour délavée | Addition trop forte de lumière ambiante et directionnelle | Éclairage rééquilibré ; rue nocturne lisible et carte éclairée pour l'exploration |
| Certains nouveaux modèles et aperçus ne pouvaient pas être chargés correctement | 24 GLB, les quatre textures PNG et les 217 aperçus PNG avaient été altérés lors d'un traitement de texte de la précédente copie | Restauration binaire depuis le ZIP ; test des 213 empreintes SHA-256, en-têtes, tailles et ressources externes ; contrôle des 221 PNG et empreinte du pack actif vérifiée |
| Fiches peu naturelles au toucher | Panneaux HTML sans comportement de tiroir ni gestion complète du focus | Réutilisation du composant Vaul déjà installé : poignée de fermeture au geste, focus modal, Échap et bouton Fermer ; défilement du contenu conservé |
| Choisir un transport débitait immédiatement le portefeuille | Une option de transport lançait directement le trajet | Choix → récapitulatif → confirmation → débit existant. Annuler ne débite rien. Un solde insuffisant ne lance plus une marche de remplacement |

Les 2 532 identifiants de parcelles, les coordonnées, portes, localités et liens vers les services sont conservés. Aucun compte, contrat, solde réel, migration Supabase ou résidence n'est modifié par la composition visuelle.

## Modèles réellement reliés à des lieux

Les noms ci-dessous sont les clés du pack actif ; le champ `src` de son manifeste désigne le GLB source exact.

| Modèle / composition | Lieu existant | Interaction existante conservée |
| --- | --- | --- |
| `com-k` | Maison des coopératives de Tokoin (`lm-0`) et autres quartiers | Fiche, trajet, entrée et panneau d'organisation selon les droits |
| Canopées, `display-fruit`, `display-bread`, parasols | Grand marché d'Assigamé (`lm-6`) et marchés de quartier | Fiche, trajet, entrée et activités du marché |
| `com-j` avec croix | CHU de Tokoin (`lm-10`) | Fiche, trajet et intérieur clinique |
| `com-k` avec signalétique | Lycée d'Adidogomé (`lm-17`) | Fiche, trajet et activités scolaires existantes |
| `com-g` avec signalétique | Salle Fitness Tokoin | Trajet confirmé, entrée, approche d'un équipement et effets de l'activité |
| Maisons `sub-*` | Parcelles résidentielles existantes | Même identifiant, même porte et même navigation ; nouvelle emprise visuelle |

## Ce qui manque encore par rapport à LagosLife

- **Composition d'ensemble** : les six quartiers suivent le monde HarooLife existant. Ils ne sont pas la carte propriétaire de LagosLife. Une projection totalement différente doit conserver le lien par ID et faire l'objet d'une décision de composition ; déplacer les lieux persistés automatiquement casserait les anciennes parties.
- **Aéroport complet** : le ZIP contient routes, maisons, commerces et industrie, pas de kit d'aéroport complet vérifié. Ne pas rebaptiser un entrepôt comme aéroport fini.
- **Fiches de vrais joueurs et conversations privées** : le protocole actuel accepte les salons `world`, `locality`, `canton`, `coop` et exclut explicitement les `dm` en attendant une politique de consentement. La conversation locale avec un PNJ ne constitue pas une messagerie privée entre comptes. Ce correctif n'active pas de fausse messagerie privée.
- **Invitations et visites privées** : nécessitent acceptation et droits sur la résidence ; elles ne découlent pas du seul rendu d'une maison.
- **Transferts entre joueurs** : la monnaie de simulation reste locale. Un véritable transfert partagé demande une transaction serveur et une protection contre les doublons.
- **Présence et missions réelles** : les adaptateurs existants sont conservés. Leur recette exige des comptes et une configuration de services valides ; les tests de rendu ne prouvent pas leur disponibilité en production.
- **Téléphone et publicité** : leurs fonctions existantes sont conservées. Les captures de référence ne justifient pas d'inventer des applications, des campagnes payées ou des prix.

Ces éléments nécessitent des évolutions métier distinctes. Ils ne sont pas présentés comme livrés avec cette correction visuelle.

## Vérifications reproductibles

```sh
npm ci --ignore-scripts --no-audit --no-fund
node scripts/haroolife-bake-models.mjs public/haroolife/vendor/kenney-v3 public/haroolife/city --reuse-existing
npm run test:haroolife-map
npm run test:unit
npm run test:hardening
npm run typecheck
FAITIERE_LOCAL_VERIFY=1 NEXT_TELEMETRY_DISABLED=1 npm run build
HAROOLIFE_TEST_PORT=3017 PW_CHROMIUM_PATH=/usr/bin/chromium npx playwright test --config=e2e/lome-life-playwright.config.ts e2e/lome-map-native.spec.ts e2e/lome-world-life.spec.ts
```

Les tests navigateur ciblent le même build de production, sur ordinateur et écran Android émulé, avec WebGL logiciel. Ils contrôlent gestes, annulation, retour au jeu, confirmation du transport, coût, arrivée et entrée. Les captures sont écrites dans `test-results`. Un Android physique reste nécessaire pour mesurer les performances GPU et le comportement des gestes système réels. Aucun FPS de Chromium logiciel n'est présenté comme une mesure du téléphone de l'utilisateur.

Résultats locaux : 220 tests unitaires existants, 32 tests de durcissement et 4 contrôles supplémentaires d'assets passent. TypeScript et compilation de production passent. Huit scénarios navigateur passent sur les deux formats ; quatre scénarios supplémentaires sur le build suivant valident notamment le pincement. Le dernier correctif de confinement des noms a ensuite été revérifié sur ordinateur et Android émulé.

Captures : [avant](captures/haroolife-cartes-correction/avant-carte-mobile.png), [noms sur mobile](captures/haroolife-cartes-correction/apres-noms-mobile.png), [noms sur ordinateur](captures/haroolife-cartes-correction/apres-noms-desktop.png). La capture avant a été réalisée dans le serveur de développement avant les corrections ; les captures après viennent du build de production local.

Autres états vérifiés : [carte par défaut](captures/haroolife-cartes-correction/apres-carte-mobile.png), [vue de jeu](captures/haroolife-cartes-correction/apres-jeu-mobile.png), [trajet confirmé](captures/haroolife-cartes-correction/trajet-confirme-mobile.png), [intérieur à l'arrivée](captures/haroolife-cartes-correction/interieur-mobile.png).
