# Lieux, vie sociale et véhicules — 16 octobre 2026

## Diagnostic corrigé

La scène réutilisait un bureau générique pour la banque, la mairie, l’école, la gare, la coopérative et l’entrepôt. Ses meubles proposaient des actions refusées par le moteur. Les logements et l’hôtel recevaient les actions de la maison du prototype, qui ne sont pas celles d’une visite en ville. Les toilettes du gymnase et les brochettes du parc étaient également refusées. Enfin, les conversations utilisaient la même réponse pour tous les messages.

`activities.ts` définit maintenant les actions métier partagées entre le moteur et les meubles. `layoutFor(room, lot)` construit un aménagement stable avec uniquement ces actions, chacune sur un objet accessible. Le moteur Three.js, le rendu R3F optionnel et la maison du prototype sont conservés. Les mosquées utilisent des tapis de prière, sans autel. Les avatars adultes et leurs animations existantes sont conservés. La vue d’entrée des pièces publiques et des bâtiments de ville montre la pièce entière pour rendre le comptoir et les habitants découvrables sur téléphone ; la maison du prototype garde son cadrage. La station possède une pompe 3D interactive. Les six intérieurs du domaine sont également audités : le puits permet de se laver, le vendeur du parc ouvre le catalogue, la mairie garde son poste de travail et un accès effectif au compte de jeu ; les commandes de cours ou de travail en ville qui y étaient refusées sont retirées.

## Audit des catégories

| Bâtiment | Interaction disponible |
| --- | --- |
| Maison, appartement | Accueil et discussion, s’asseoir, toilettes ; conversation avec les voisins |
| Boutique | Catalogue du jeu, provisions, repas à emporter, vendeuse |
| Marché | Catalogue du jeu, repas à emporter ; accès distinct aux offres réelles Haroo |
| École, université | Cours payant, progression des compétences ; enseignant |
| Banque | Finances du jeu, recettes et dépenses ; conseillère |
| Hôpital | Consultation payante, récupération, toilettes ; personnel |
| Salle de sport, stade | Tapis, vélo, musculation, yoga, coach, douche, toilettes ; sportifs |
| Lieu de culte | Prière, rencontre de la communauté ; intérieur adapté pour les mosquées |
| Parc, port | Détente, vendeurs de provisions et conversations |
| Hôtel | Chambre payante, récupération d’énergie et d’hygiène ; voisin |
| Gare | Tri des colis rémunéré, conversations ; transports et voyages existants conservés |
| Mairie | Service communal rémunéré une fois par jour ; agent |
| Coopérative | Tableau de bord réel des coopératives existant, selon la connexion et les droits |
| Entrepôt | Chargement rémunéré de produits agricoles ; magasinier |
| Terrain vacant | Pas d’intérieur ; l’aménagement du domaine garde ses règles existantes |
| Panneau | Pas d’intérieur ; parcours publicitaire existant conservé |

Chaque ville possède aussi une station-service, un garage et une brigade fictifs : trois parcelles auparavant anonymes deviennent des services nommés. Aucun identifiant, aucune empreinte ni aucun monument existant ne se déplace. Les 20 catégories de bâtiments restent les mêmes.

## Marché et conversations

Le catalogue propose ayimolou, akoumé, brochettes, eau potable, panier maïs/gari, poisson grillé, fruits et savon. Chaque article a un prix et un effet sur les besoins. Il faut être dans un commerce, un marché, un parc ou un port pour acheter ; le sac reste utilisable ailleurs. Les marchés, boulangeries et parcs du domaine acceptent aussi le catalogue ; les achats de repas de l’ancien parcours comptent toujours pour l’objectif. L’achat est distinct de la consommation. Solde insuffisant et limite de 20 unités par article sont contrôlés par le moteur.

Les PNJ ont des réponses scénarisées par sujet et par lieu, un historique local et une proximité persistante. Le premier échange du jour apporte +15 social et +10 proximité ; les échanges suivants ne permettent pas de gagner indéfiniment du social. Les habitants fictifs sont explicitement distingués des joueurs connectés. Les conversations privées entre vrais joueurs, le blocage, les signalements et les transferts de monnaie du jeu utilisent les mécanismes existants. Aucun PNJ n’est présenté comme un vrai utilisateur ou une IA générative.

## Boucle taxi / zémidjan

1. Choisir son service ; véhicule et réserve initiale de carburant fournis.
2. Monter ; prise en charge et trajet automatiques sur les routes existantes.
3. À l’arrivée, calculer la recette et les frais, puis créditer le **net**.
4. Provisionner le remplacement de l’essence consommée et l’entretien. Le reçu affiche les deux débits. Ces provisions restent séparées du portefeuille disponible.
5. Quand nécessaire, rejoindre automatiquement la station (réservoir à 25 %), le garage (8 km de jeu) ou la brigade (tous les 3 trajets). Attendre la prestation, puis reprendre les clients.
6. À la pompe et au garage, utiliser les provisions : **aucun deuxième débit du portefeuille**. Le contrôle de sécurité est gratuit ; papiers de jeu, casque ou ceinture sont fournis avec le véhicule. Il n’y a pas d’amende aléatoire.

Prix de simulation : 700 FCFA/L ; distance accélérée de 40 m par cellule ; consommation taxi 6,5 L/100 km, moto 2,5 L/100 km ; réserve entretien taxi 18 FCFA/km, moto 10 FCFA/km. Le réservoir représente la réserve de service du jeu (4 L / 2 L), pas la capacité réelle du véhicule. Les échéances d’entretien sont accélérées pour rendre la boucle jouable. Ce ne sont ni des prix officiels togolais ni des recommandations mécaniques réelles.

La distance mesurée inclut l’approche du client et les détours de service depuis le paiement précédent. Le reçu est établi à l’arrivée. Les frais d’une course sont plafonnés à 75 % de sa recette pour empêcher une approche exceptionnellement longue de créer une dette. Les commandes de conduite manuelle restent désactivées en service. Un arrêt demandé pendant une course attend le dépôt du client et le paiement.

Le suivi est indépendant pour le taxi et la moto et reste dans la sauvegarde : choisir un autre métier ne redonne pas de carburant ni ne supprime l’usure. Les prestations manuelles au garage ou à la station affichent le complément restant après provisions et vérifient le solde.

## Sauvegardes et vérification

Les champs `commerce`, `social`, `socialDays` et `fleet` sont optionnels dans la sauvegarde v1 existante, avec validation des valeurs à la lecture. Aucun redémarrage de partie et aucune migration Supabase nécessaires. La progression historique de l’objectif « acheter un repas » est reprise une fois depuis l’ancien critère ; les nouveaux frais du véhicule ne peuvent plus le valider.

`haroolife-place-workflows.test.ts` vérifie les objets et leurs chemins d’accès dans toutes les catégories des deux villes, les achats et consommations, les conversations, les comptes du véhicule et l’enchaînement des trois arrêts automatiques. Les scénarios Playwright vérifient le comptoir 3D, les achats, l’historique après rechargement et un taxi dont les prestations arrivent à échéance, sans téléportation de trajet ni pilotage manuel. Les régressions de la moto et des deux services automatiques sont conservées.

Validation effectuée : 279 tests unitaires réussis ; compilation Next.js et contrôle TypeScript réussis (189 pages statiques) ; 8 scénarios Android distincts validés : maison, marché historique, rue/carte, deux courses taxi, deux courses zémidjan, catalogue/conversation persistante, arrêts automatiques du taxi et puits historique. Les captures de contrôle sont conservées localement dans `artifacts/haroolife-lieux/`.
