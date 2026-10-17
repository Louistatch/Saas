# HarooLife : lieux, piétons et mairie

## Intérieurs

Tous les intérieurs du jeu passent par le contrôleur Three.js existant `RoomWorld`, y compris après un ancien choix `engine=three`. Le prototype R3F reste disponible dans le code. Aucune migration de compte, de carte ou d’avatar. Les sauvegardes anciennes dont le curseur du domaine était sur l’allée virtuelle sont récupérées en conservant leur solde ; ce curseur reste désormais sur une route construite, tandis que la position physique du joueur est conservée séparément.

Chaque objet qui propose une action et chaque habitant abordable possède une bulle. Le guide « Objets et personnes » donne son nom et déclenche le même déplacement physique vers un point libre. Un trajet vert et un cercle au sol orientent le joueur. Les étudiants figurants restent occupés pendant le cours ; le professeur et le secrétariat parlent.

À l’université : tableau des horaires consultable gratuitement, cours payant à sa place libre seulement pendant la séance, chaise libre pour s’asseoir, secrétariat. Les chaises libres des administrations et de la clinique deviennent utilisables. Les poses durables et les repas de la version précédente sont conservés ; les étudiants assis sont placés à la hauteur de leur chaise.

## Circulation

`PavementGraph` raccorde les trottoirs aux passages piétons de `streetDressing`. Le joueur guidé et les huit habitants animés utilisent ce réseau. Les chemins propres au domaine sont conservés. La route de jeu reste une liste de cases ; seules les positions du contrôleur sont continues : on ne modifie pas les identifiants des lots ni les sauvegardes existantes.

Les feux sont de véritables objets Three.js instanciés, avec la même horloge que les règles de déplacement :

- 0–6 s : axe est-ouest vert ; 6–7 s : orange ;
- 7–13 s : axe nord-sud vert ; 13–14 s : orange ;
- 14–20 s : piétons verts, véhicules rouges.

Le joueur et les habitants attendent au bord du passage puis terminent leur traversée. Les voitures et motos ambiantes ainsi que le transport automatique s’arrêtent avant les feux rouges. Les collisions existantes avec véhicules et autres personnes restent actives. La capsule du joueur tient dans la largeur du trottoir ; le taxi reste à 0,25 case du centre de sa voie pour laisser les piétons libres. Un client est pris en charge sur la route voisine de son trottoir, puis déposé sur un emplacement piéton. Une partie des carrefours démarre en orange clignotant : priorité prudente aux piétons, sans sanction pour feu rouge inexistant.

## Contrôles fictifs

La marche manuelle sur la chaussée hors passage ou une traversée commencée au rouge déclenche un arrêt après 0,65 s d’exposition. Le joueur a trois secondes pour quitter un point d’apparition ou un véhicule. Il n’est jamais sanctionné comme passager ni pendant une téléportation.

Premier contrôle : avertissement gratuit. Contrôles suivants : 500 FCFA **du jeu**, uniquement si le solde suffit. Aucun découvert ni blocage financier. Un arrêt ne prélève qu’une fois ; un nouveau contrôle exige 60 secondes et un retour au trottoir. Une traversée entamée au vert peut être terminée. L’agent rejoint le joueur, le dialogue explique le motif et propose le retour automatique au trottoir.

Ces règles ne représentent pas les amendes légales du Togo. Les compteurs et dépenses sont sauvegardés dans `civic` ; l’arrêt visuel et les temporisations ne progressent que pendant le jeu visible. Aucun paiement réel ni modification de Supabase nécessaire.

## Mairie

Chaque mairie contient son personnage municipal fictif, un tableau et un service communal rémunéré séparément. L’humour vise des personnages de jeu : discours, rubans d’inauguration et dossiers qui traînent. Aucun élu réel n’est mis en cause.

Le signalement des feux est gratuit et enregistré une seule fois par localité. Le suivi affiche le délai de deux heures de jeu. Ensuite `municipalRepairDone` active les feux auparavant en panne ; le rendu et les véhicules utilisent ce même état. Une réparation à Lomé ne répare pas Kara. Pour faire passer ces heures, utiliser le bouton de temps du jeu ; il n’y a pas de progression hors ligne.

## Vérification

- Tests unitaires des chemins et passages, de l’attente rouge/vert, des contrôles, des comptes, des sauvegardes et de la réparation locale.
- Vérification des objets réellement atteignables pour tous les types d’intérieurs dans les six localités.
- Parcours Playwright sur téléphone : université avec ancienne préférence R3F, cours assis, maire et réparation, contrôle piéton et retour au bord, trajet à pied. Régression des repas et du taxi automatique.

Dans le navigateur Firefox de test avec écran tactile émulé, les déplacements manuels sont vérifiés au clavier ; le glissement analogique est vérifié dans Chromium. Les parcours utilisent la scène 3D et les commandes du jeu, sans avancer artificiellement les paiements.
