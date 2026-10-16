# HarooLife — accueil FaîtiereHub et viewport mobile

## Parcours

Toutes les adresses `/haroolife` passent par le même `GameEntry`, dans le layout existant.
Un visiteur voit un accueil HarooLife aux couleurs de FaîtiereHub, avec connexion et inscription
sur les pages habituelles. La session Supabase et le profil de `AuthProvider` font foi : aucun
compte de jeu, rôle ou mécanisme d’authentification supplémentaire n’est créé.

Une personne connectée voit son prénom et la partie enregistrée sur cet appareil, puis choisit
« Continuer ma partie » ou « Entrer dans HarooLife ». Le monde et les modules Three.js sont
chargés à cette étape. L’entrée reste mémorisée pour ce compte dans l’onglet ; elle ne vaut
jamais authentification et ne fonctionne plus après expiration ou changement de session.
Le monde continue à vivre dans le même layout lors de la navigation entre les modules.

Téléphone → Réglages → « Accueil HarooLife · Compte FaîtiereHub » enregistre la partie et revient
à l’accueil. « Changer de compte » emploie la déconnexion complète FaîtiereHub, puis propose la
connexion avec un retour au jeu. Les autres boutons de déconnexion gardent leur comportement.

La progression fictive existante reste locale à cet appareil, sous les mêmes clés. Cette
modification ne crée pas une synchronisation cloud des sauvegardes, ni un portefeuille réel.
Les gardes serveur, rôles professionnels et règles d’accès des services réels sont conservés.

## Retours depuis l’authentification

`lib/haroolife/entry.ts` conserve les routes du jeu, leurs sous-pages et leurs paramètres.
Les liens d’inscription gardent également le métier sélectionné. Une intention de retour de
45 minutes, `haroolife_return`, permet de retrouver le jeu après les étapes d’inscription et
la confirmation d’e-mail sur le même navigateur. Le renvoi d’e-mail transmet aussi `next`.
Les callbacks ne consultent cette intention qu’après vérification du lien et de l’utilisateur.
Ils la consomment alors. Sans intention de jeu, le routage habituel du compte est conservé.

Cette valeur est seulement une destination, jamais une session : elle est limitée aux chemins
internes `/haroolife`. Les autres origines, routes d’authentification, antislashs et traversées
de chemin sont refusés. Un lien ouvert sur un autre appareil sans destination de retour suit
l’accueil normal du compte FaîtiereHub.

## Firefox et barres de navigation Android

Le conteneur du jeu est fixé explicitement à l’écran. `useHarooLifeViewport` ajuste sa hauteur
à `visualViewport.height` et son décalage à `offsetTop`, avec repli sur `innerHeight`.
Les redimensionnements, rotations et changements des barres du navigateur réévaluent les
dimensions. Le zoom natif de l’utilisateur reste libre ; ses gestes ne sont pas interceptés.

Les espacements `env(safe-area-inset-*, 0px)` ont une valeur de repli explicite. Le téléphone
reste dans le conteneur ; les tiroirs portalisés tiennent compte de l’espace masqué en bas et
de la hauteur visible. Le menu conserve quatre actions et des cibles tactiles d’au moins 44 px.
Les variables CSS temporaires et les écouteurs sont retirés en quittant le jeu.

Le moteur attend le résultat de la détection WebGL2 avant de se monter. Les erreurs de création
du renderer sont isolées dans `GraphicsBoundary`, et l’aperçu d’avatar possède la même protection.
Une absence d’accélération affiche un message et un bouton pour réessayer ; elle ne remplace
plus tout le jeu par la page d’erreur globale et ne masque pas le menu. La sauvegarde est chargée
indépendamment du test graphique : une exception WebGL ne doit pas réinitialiser la partie.
Dans ce cas, l’onglet Carte ouvre directement la liste des lieux au lieu d’une caméra indisponible.

## Vérification

- Tests unitaires des destinations, cookies encodés et liens de retour.
- Scénarios de connexion par le vrai SDK Supabase contre le serveur de test local : accueil
  anonyme sans GLB chargé, confirmation d’e-mail, choix du profil, reprise, expiration et sortie.
- Chrome au format Android et Firefox : quatre boutons visibles et cliquables avec une hauteur
  visuelle inférieure à la fenêtre, redimensionnement et paysage.
- Les fixtures fournissent une session uniquement au serveur Supabase local ; aucun drapeau
  permettant de contourner l’authentification en production n’est ajouté.

Pour ce cloud, Firefox doit être lancé hors du bac à sable de commandes : son processus interne
échoue à écrire son espace de noms dans `/proc` autrement. Aucun réglage du navigateur ou de la
sécurité du produit n’est changé pour cela. Chemin local du navigateur : `PW_FIREFOX_PATH`.
