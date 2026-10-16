# Régions et vie quotidienne — 16 octobre 2026

Les ajouts restent dans l’architecture HarooLife existante : villes déterministes, moteur de rue Three.js, contrôleur continu, intérieurs et sauvegarde v1. L’authentification FaîtiereHub, le mode visiteur, la modération et la sauvegarde en ligne récupérés de main sont conservés. Aucune migration de base n’est nécessaire.

## Territoires jouables

| Région / secteur du jeu | Ville | Préfecture de placement |
| --- | --- | --- |
| Maritime | Lomé | Lome Commune |
| Plateaux Ouest | Kpalimé | Kloto |
| Plateaux Est | Atakpamé | Ogou |
| Centrale | Sokodé | Tchaoudjo |
| Kara | Kara | Kozah |
| Savanes | Dapaong | Tone |

Les Plateaux Est et Ouest sont deux secteurs de jeu de la même région administrative. Les pôles de la carte nationale utilisent les centroïdes du fichier de limites existant. Les quartiers 3D sont des simplifications de jeu, sans prétention de reconstruction GPS. Les quatre nouvelles villes utilisent des paysages distincts (savane, rivière, collines, végétation), des monuments nommés, un réseau routier relié, marché, santé, culte, école, sport, transport et coopérative. Le domaine reste à Lomé et n’est jamais régénéré par un voyage. Les anciennes parcelles de Lomé et Kara conservent leurs identifiants et leurs positions.

Les anciens métiers journaliers trouvent aussi leur lieu de travail dans chaque ville et vérifient la présence sur place ; la position dormante du domaine ne peut pas faire croire que l’on est à un poste de Lomé. Un service déjà commencé doit être terminé avant un autre emploi. Tous les couples de villes disposent d’un trajet interurbain avec tarif et durée fictifs. La comparaison des compagnies existante sur Lomé–Kara est conservée. Les semis et prix du nouveau module « Mon champ » reconnaissent chaque ville ; les deux secteurs Plateaux utilisent les relevés de la région Plateaux. Le calendrier agricole reste une simplification pour le jeu.

## Emplois à l’heure

Chaque ville possède deux commerces nommés, pris parmi les boutiques anonymes existantes : Mixx by Yas et Moov Africa. Ce sont des missions **fictives**, sans partenariat, contrat réel, commission réelle ni opérations Mobile Money. Aucun transfert d’argent ou achat d’une vraie marque n’est effectué.

Depuis Métiers : rejoindre le point de vente par les rues, entrer, commencer. Le service verse 1 200 FCFA du jeu après chaque heure complète ; une heure de jeu dure 11 secondes au premier plan. Le temps avance automatiquement pendant le service, même si l’horloge ordinaire est en pause. Horaires du jeu : 7 h–19 h ; plafond commun de 4 h par jour entre les deux employeurs. L’interface affiche les heures payées et le cumul. Les besoins et le service taxi/moto sont vérifiés. Sortir, voyager, terminer le service ou recharger interrompt le poste. Il n’existe aucun rattrapage de salaire hors ligne ni pour les heures sautées manuellement. Les cumuls et le plafond quotidien sont sauvegardés ; un poste n’est jamais repris sans action de la personne.

## Carburant et aviation

La référence carburant est le **super sans plomb à 817 FCFA/L**, effet au **11 septembre 2026**, vérifiée le **16 octobre 2026** sur [Togo Officiel](https://www.republiquetogolaise.tg/gouvernance-economique/1109-12268-nouveaux-tarifs-pour-les-produits-petroliers-a-partir-de-ce-vendredi). Le même article indique le gasoil à 766 FCFA/L, mais les véhicules de service actuels utilisent le super. Cette référence est datée et centralisée dans `FUEL_REFERENCE` ; elle n’est pas un flux de prix en temps réel. Les quantités accélérées, réserves d’entretien et tarifs des courses restent des règles du jeu. La provision se calcule au tarif de référence et la pompe ne débite pas une deuxième fois le portefeuille.

La liaison aérienne fictive Lomé–Niamtougou (navette Kara comprise) se réserve dans le terminal, après un trajet vers l’aéroport. Il faut terminer ses services et posséder 18 000 FCFA du jeu. Le débit et l’arrivée sont effectués ensemble ; un solde insuffisant ou l’absence du terminal ne change ni la ville ni l’argent. Le voyage affiche un avion et une durée de vol, puis ouvre le quartier d’arrivée. Aucun vol commercial régulier ni billet réel n’est annoncé. Les autres villes restent accessibles par la route.

## Rue et interactions

Le rendu Three.js de rue possède maintenant dix véhicules locaux, voitures et motos, qui suivent le réseau routier même lorsque le joueur ne bouge pas. Les voitures réutilisent les GLB Kenney CC0 déjà livrés ; les motos utilisent le modèle du jeu, avec les avatars adultes animés existants pour les conducteurs. Le nombre est borné et les ressources sont libérées à la fermeture de la scène. Aucun personnage cubique n’est ajouté.

La collision est **cinématique** : capsule du piéton, empreintes orientées des véhicules et cellules solides de la ville. Les bâtiments, l’eau hors ponts, les reliefs et le mobilier intérieur restent infranchissables. Les véhicules du trafic s’arrêtent devant les personnes et les autres véhicules ; la conduite automatique conserve son itinéraire et attend devant un obstacle. Il ne s’agit pas d’une simulation d’accident, de déformation ou de dommages. Le service se dessine dans la même voie latérale que son corps de collision.

Au marché, « Commander et manger ici » réalise l’achat et la consommation en une action, avec contrôle du solde et de la limite du sac. Un achat refusé ne consomme jamais une provision déjà possédée. Les actions distinctes d’achat et de consommation sont conservées. En intérieur, la consommation déclenche l’animation d’interaction de l’avatar. Les pastilles des équipements et des conversations sont disposées avec une zone tactile de 44 pixels sans se recouvrir, en donnant priorité aux équipements ; les activités restent aussi accessibles depuis la fiche du lieu. Le vélo de salle possède une boucle de pédalage calculée sur le squelette adulte, avec jambes alternées, pieds attachés et position sur la selle ; l’instance originale de l’avatar reste inchangée.

## Présence et messages

Le bouton des joueurs en ligne ouvre la liste des personnes **réellement connectées dans la ville actuelle**, à partir du relais Socket.IO existant, avec leur nom public. Toucher un nom ouvre le profil existant puis la conversation privée, avec les protections de blocage et signalement déjà présentes. Les PNJ ne sont jamais comptés. Hors connexion, le compteur affiche « — » et ne prétend pas confirmer une présence.

Les six identifiants de ville sont acceptés par le relais pour la présence et les positions ; un joueur à Dapaong n’est plus annoncé à Lomé. Les salons persistants actuels de Postgres restent inchangés : les nouvelles villes utilisent le salon national Togo et les messages privés existants. Aucune fausse liste globale ou récupération de téléphone/e-mail n’est ajoutée. Le relais doit être déployé avec ce commit pour accepter les nouvelles villes.

## Vérification

Tests métier : services accessibles dans les six villes, sauvegardes compatibles, quatre heures de kiosque, interruption/rechargement, refus de cumul avec taxi, aviation et solde, achat/consommation atomiques, vélo, capsules et boîtes orientées, trafic visible et référence carburant. Tests du vrai relais local : présence dans les quatre nouvelles villes et message privé autorisé. Scénarios Playwright Android : voyages dans les quatre régions, salaire de chaque kiosque, embarquement, mouvement du trafic et pédalage ; régressions taxi, zémidjan, marché et avatar.
