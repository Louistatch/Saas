# Ambulance et maire dans HarooLife

Accès : **Téléphone → Services publics**. Le panneau est également accessible
depuis les objets et activités de l’hôpital et de la mairie. Les secours,
les soins, le budget communal et les personnages décrits ici appartiennent au jeu.

## Ambulance

1. Descendre du véhicule, puis appeler depuis le panneau. Depuis un bâtiment,
   « Sortir et appeler l’ambulance » place l’appel à sa sortie.
2. L’hôpital accessible le plus proche envoie son ambulance sur le réseau routier.
   Attendre au point d’appel ; le véhicule s’arrête à proximité et une soignante
   rejoint le personnage.
3. Le joueur monte automatiquement. La caméra se rapproche et accompagne le retour
   vers l’hôpital ; aucun pilotage manuel n’est nécessaire.
4. À l’arrivée effective, le personnage entre dans l’hôpital : énergie +30 et
   hygiène +20, plafonnées à 100. Ces premiers soins sont gratuits une fois par jour
   de jeu. Les autres activités de l’hôpital restent disponibles.

Le bouton d’annulation fonctionne pendant toutes les phases : aucun prélèvement
ni soin anticipé, reprise sur le trottoir proche et restauration de la caméra.
Un rechargement relance l’intervention sauvegardée depuis l’hôpital, sans attribuer
de soin hors ligne. Une arrivée reçue deux fois ne donne jamais deux récompenses.
Un trajet bloqué se termine avec un message et permet de rappeler gratuitement.
L’appel met fin au service professionnel en cours ; il n’accorde pas son salaire.

## Maire

À la mairie, utiliser le tableau de signalement, ou ouvrir les services publics
et signaler les feux. Depuis la rue, le même panneau propose le trajet vers la mairie.

Le maire mandate une équipe et réserve **250 FCFA du jeu sur le budget communal**.
Une dotation fictive complète le financement si ce budget est insuffisant ; elle
ne crédite jamais le portefeuille du joueur. Un second signalement ne débite rien.

Un technicien animé et des cônes apparaissent près d’un carrefour réellement en panne.
Le téléphone affiche le financement, le suivi et le bouton « Rejoindre le chantier ».
Après deux heures de jeu, les feux du quartier fonctionnent et le chantier disparaît.
L’horloge avance automatiquement pendant ces travaux : environ 22 secondes avec
l’onglet visible. Aucune manipulation de l’horloge n’est nécessaire. Un ancien
signalement sauvegardé conserve sa date et son résultat.

## Intégration et limites

- Moteur impératif Three.js conservé : une seule boucle de rendu, contrôleur routier
  existant, feux et collisions partagés. L’ambulance respecte aussi les véhicules
  arrêtés que le personnage à pied peut contourner.
- Modèle d’ambulance Kenney CC0 déjà inclus dans le pack ; avatars animés existants.
  La copie décorative sans collision à la sortie de l’hôpital est retirée de la rue.
- Géométries et matériaux de l’ambulance partagés, gyrophare sans lumière dynamique,
  cônes instanciés, animation des agents soumise au budget de visibilité existant.
  Les changements de phase ne reconstruisent pas la scène WebGL.
- Le mode `ride:ems` du relais existant montre le transport aux joueurs voisins.
  Aucun changement de protocole, de service serveur ou de migration SQL.
- Les interventions et réparations suivent la sauvegarde du joueur ; ce n’est pas
  une file de secours ou un budget partagé entre toutes les sessions du serveur.
- Les essais Android utilisent un viewport Pixel 7 dans Chromium avec rendu logiciel ;
  ils vérifient le parcours, pas les performances d’un téléphone physique.

## Vérification

`tests/haroolife-public-services.test.ts` couvre les six villes, le financement,
la reprise et l’annulation, les arrivées idempotentes, le contrôleur routier réel,
les collisions bloquantes et la suppression précise de l’ancien décor d’ambulance.
`tests/haroolife-remote-vehicles.test.ts` couvre le mode véhicule du relais.

Les parcours navigateur sont inscrits dans la suite existante et peuvent aussi
tourner avec le vrai relais SQL local isolé :

```bash
HAROOLIFE_TEST_PORT=3245 HAROOLIFE_SUPABASE_PORT=54405 \
NEXT_PUBLIC_TURNSTILE_SITE_KEY='' PW_CHROMIUM_PATH=/usr/bin/chromium \
npx playwright test --config=e2e/lome-public-services.config.ts \
  -g 'ambulance:|mayor:|town hall:|real relay:'
```

Les fixtures n’utilisent aucun compte ni paiement de production.

Validation du 18 octobre 2026 : **490 tests unitaires**, **34 tests de durcissement**,
typecheck et contrôles statiques de sécurité réussis. **10 parcours navigateur**
réussis sur PC et au format Android : soins, annulation/rechargement, mairie,
chantier et transport sur le véritable relais SQL isolé.

Captures du jeu : [transport Android](captures/public-services/ambulance-transport-android.png),
[suivi municipal Android](captures/public-services/maire-suivi-android.png),
[chantier PC](captures/public-services/maire-chantier-pc.png).
