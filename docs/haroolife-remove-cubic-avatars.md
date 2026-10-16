# HarooLife — retrait des personnages cubiques

Cette correction conserve les deux moteurs existants : Three.js impératif (`haroo`, par défaut)
et React Three Fiber (`?engine=three`). Elle ne change ni les comptes, ni les métiers,
ni les trajets automatiques, ni les clés de sauvegarde du jeu.

## Causes et corrections

- Le sélecteur « Personnages classiques » réactivait six anciens minis Kenney. Il est supprimé.
- `classic: true` empêchait la migration. Les six anciens identifiants sont désormais convertis
  vers Afi, Abra, Kossi ou Koffi, y compris pour les joueurs distants. Le pagne est conservé ;
  la sauvegarde d'apparence est normalisée sans toucher au portefeuille ni à la progression.
- Le trajet moto chargeait encore directement un mini. Il utilise maintenant le même adulte
  articulé que la rue et les bâtiments, sur la moto existante ; le taxi possède aussi son conducteur.
- Les surcouches de vêtements en `BoxGeometry` sont supprimées. Les matériaux des vêtements,
  de la peau et des cheveux des vrais modèles sont recolorés sur chaque instance.
- Les sept GLB cubiques inutilisés sont retirés de `public`. Une valeur de modèle inconnue
  retourne un adulte livré avec le jeu et ne construit jamais une URL arbitraire.

Les piétons, PNJ intérieurs et représentants d'organisations émettent maintenant des identifiants
adultes. Les anciens noms n'existent plus que comme alias de compatibilité dans le catalogue.

## Rendu et animation

`game/render/avatar-actor.ts` centralise le clonage des squelettes, les matériaux indépendants,
les transitions d'animation et la libération des ressources. Un acteur impératif refuse un modèle
sans `SkinnedMesh`. Les géométries GLB partagées ne sont jamais détruites au retrait d'un PNJ.
Le composant R3F réutilise les mêmes clips et conserve également son squelette propre.

Les quatre GLB Quaternius déjà présents sont conservés sous leur licence CC0 (voir
`public/haroolife/vendor/quaternius/LICENSE.txt`). Ils fournissent six clips : `Idle`,
`Idle_Neutral`, `Interact`, `Run`, `Walk`, `Wave`. Le septième, `HarooDrive`, est généré pour
chaque squelette : cuisses orientées vers l'avant, genoux pliés, pieds rattachés aux extrémités
des tibias, bras vers le guidon ou le volant et respiration discrète. Le rig et les clips sources
restent intacts. Chaque personnage possède son propre `AnimationMixer`.

Le trajet utilise une caméra derrière le véhicule, des matériaux PBR, l'exposition ACES et des
ombres douces selon la qualité choisie. Les roues tournent ; la moto accompagne légèrement le
mouvement. Les commandes de rue disparaissent pendant le trajet. Le chargement et l'échec
du modèle ont un état visible avec possibilité de réessayer.

Les animations assise, couchée et de prière restent à produire : elles utilisent encore la pose
neutre disponible. Cette correction ne prétend pas ajouter ces clips ni des personnages
photoréalistes ; elle élimine les anciens humains cubiques et fiabilise les adultes articulés.

## Vérification

- Tests unitaires sur les quatre GLB réels : squelette indépendant, posture de conduite,
  longueur des tibias conservée, source intacte et géométrie partagée non détruite.
- Migration de `classic: true`, persistance du pagne et gestion d'un stockage en lecture seule.
- Scénarios Chromium au format Android : apparence dans la rue et les pièces, sauvegarde et
  rechargement, deux moteurs, trajets moto et taxi avec contrôle du cadrage et interception
  de toute requête vers un ancien personnage cubique.
- Régressions sur les actions de la maison et le service zémidjan automatique rémunéré.

Ce document remplace les passages sur les minis et l'exception `classic` dans
`haroolife-v3-lagos.md`, qui décrivaient l'ancienne version.
