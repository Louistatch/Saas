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

