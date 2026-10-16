# Véhicules de service HarooLife

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
  --grep 'returning driver|old save with|starting a moto|delayed taxi|HarooLife zémidjan' \
  --project=mobile-android
```

Le banc d'essai reconstruit les sources et démarre son propre serveur par défaut.
`HAROOLIFE_TEST_USE_BUILD=1` réutilise explicitement une compilation déjà vérifiée ;
`HAROOLIFE_REUSE_SERVER=1` autorise explicitement un serveur existant. Ces options ne
doivent pas servir à valider des sources modifiées depuis leur démarrage ou compilation.
