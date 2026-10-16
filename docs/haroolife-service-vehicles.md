# Véhicules de service HarooLife

## Service automatique

Monter dans le taxi ou le zémidjan lance maintenant l'activité complète : recherche d'un
passant, déplacement routier vers lui, embarquement, trajet routier, arrêt, dépôt et crédit
du portefeuille fictif. Deux secondes après le paiement, le véhicule cherche le client
suivant. Aucune accélération, direction, prise de client ou validation de dépôt n'est
demandée au joueur. Descendre pendant une course programme l'arrêt après le dépôt et le
paiement. Descendre avant embarquement annule la recherche sans gain.

`AutomaticDrivingService` coordonne les étapes ; le `PlayerController` existant déplace
réellement le véhicule de case routière en case routière. `planServiceFare` vérifie la
connexion de la destination et calcule le tarif sur la distance routière. L'événement de
paiement est émis une seule fois, après l'arrivée et l'arrêt. Il n'y a pas de paiement
pendant que l'onglet est masqué, ni de saut à destination pour terminer une course.

Le taxi Kenney CC0 est ajusté sur ses dimensions réelles : berline de 4,1 × 1,7 × 1,45 m
pour un adulte de 1,75 m. Le toit est plus bas que la tête du personnage et la largeur
reste inférieure à 60 % d'une cellule de rue.

Les scénarios taxi et zémidjan de `lome-house-haroo.spec.ts` attendent deux courses
automatiques réelles et leurs paiements après un seul embarquement. Ils ne font apparaître
aucun client artificiel et ne déplacent pas le véhicule par une sonde de test.

```sh
HAROOLIFE_TEST_PORT=3122 PW_CHROMIUM_PATH=/usr/bin/chromium \
  npx playwright test --config=e2e/lome-life-playwright.config.ts \
  lome-house-haroo.spec.ts --grep 'automatic pickup' --project=mobile-android
```

Diagnostic du 16 octobre 2026, après les correctifs `85ad6587` et `db217d27`.

## Défauts reproduits

Les quatre scénarios de `e2e/lome-service-vehicle.spec.ts` échouaient sur la version
précédente :

1. **Retour dans une partie** : la proximité du véhicule était calculée seulement au
   changement de case. Après chargement, le bouton Monter restait absent sans déplacement.
2. **Ancienne sauvegarde** : séparer les positions au démarrage d'un nouveau service ne
   réparait pas les positions déjà enregistrées sous l'avatar.
3. **Kara** : le pont React → contrôleur effaçait tout véhicule si la ville n'était pas Lomé,
   y compris celui que le joueur venait de demander.
4. **Téléchargement lent** : le taxi initial pouvait terminer son chargement après le
   choix du zémidjan et remplacer le modèle piloté. L'ancienne sonde indiquait encore
   « moto » parce qu'elle vérifiait une référence différente de l'objet effectivement suivi.

## Comportement corrigé

- `CityLife.vehicleLocality` indique où le véhicule est garé. Le champ reste facultatif :
  une ancienne sauvegarde sans ce champ est interprétée comme un stationnement à Lomé.
- `decodeCityLife` répare un véhicule de service absent, situé dans l'autre ville ou
  superposé au conducteur. Le solde, les constructions, l'heure et la progression restent
  intacts. La réparation est idempotente.
- La proximité est relue depuis la position continue du contrôleur, au chargement puis
  toutes les 140 ms. Le bouton ne dépend plus du franchissement d'une case.
- Les changements de véhicule invalident les anciens téléchargements par un identifiant
  de génération. Le succès et l'échec tardifs d'un taxi obsolète sont ignorés. Quitter la
  scène ou une ville invalide également le chargement en attente.
- Les déplacements en conduite enregistrent la position du véhicule et sa ville.
- Un repère au-dessus du véhicule permet de monter en le touchant. Toucher directement
  le modèle utilise la même action. « Retrouver ma moto » et « Rapprocher mon véhicule de
  service » permettent de récupérer un véhicule laissé plus loin.

Le contrôleur existant, Three.js, les règles de course et le stockage local v1 sont
conservés. Aucun changement Supabase ou paiement réel n'est nécessaire.

## Vérification

Les tests de régression vérifient les anciennes sauvegardes à 21 h en caméra proche,
l'embarquement après rechargement, Kara et une réponse volontairement retardée de
`taxi.glb`. Ils projettent les limites du modèle réel dans l'écran et vérifient les pixels
rouges de la carrosserie sur une capture du canvas. Une entité simplement présente dans
la scène ne suffit donc plus à valider l'affichage.

Le parcours zémidjan existant vérifie toujours l'embarquement, le passager, le dépôt et
l'augmentation du portefeuille fictif.

```sh
HAROOLIFE_TEST_PORT=3112 PW_CHROMIUM_PATH=/usr/bin/chromium \
  npx playwright test --config=e2e/lome-life-playwright.config.ts \
  lome-service-vehicle.spec.ts lome-house-haroo.spec.ts \
  --grep 'returning driver|old save with|starting a moto|delayed taxi|automatic pickup' \
  --project=mobile-android
```

Le banc d'essai reconstruit les sources et démarre son propre serveur par défaut.
`HAROOLIFE_TEST_USE_BUILD=1` réutilise explicitement une compilation déjà vérifiée ;
`HAROOLIFE_REUSE_SERVER=1` autorise explicitement un serveur existant. Ces options ne
doivent pas servir à valider des sources modifiées depuis leur démarrage ou compilation.
