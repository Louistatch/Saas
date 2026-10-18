# Interface et confort visuel HarooLife — 18 octobre 2026

## Livraison

Le moteur Three.js impératif, les modèles Blender togolais, leurs dimensions et les
fonctionnalités existantes sont conservés. Ce chantier ajoute :

- une interface ivoire / vert profond, une identité HarooLife et une localisation lisible ;
- un portefeuille avec unité FCFA, les joueurs proches, des boutons de caméra et une
  navigation tactile cohérents ;
- des jauges de besoins qui gardent leur largeur, des commandes proches des bords sur PC,
  des adaptations pour écran étroit et paysage, et le respect du mouvement réduit ;
- un panneau de chargement indiquant ce qui arrive progressivement, sans faux pourcentage ;
- des ombres de contact douces sous les personnages et les véhicules, également en qualité
  Économie. Elles complètent les ombres du soleil ; elles ne remplacent pas les modèles.

Les surfaces du HUD ne floutent plus la scène WebGL animée. Une pression anime seulement
la transformation du bouton, sans redimensionner l'interface. Aucun filtre plein écran,
post-traitement, nouvelle police, bibliothèque ou téléchargement graphique n'est ajouté.

Les ombres de contact occupent **un appel de dessin**, au maximum **64 empreintes / 128
triangles**, un seul matériau et aucune texture. Les tampons sont réutilisés, les instances
proches seulement alimentées, et toutes les ressources sont libérées avec la rue. Les
collisions et les déplacements ne dépendent pas de ces ombres.

Le minuteur React `trafficStep` de 700 ms ne pilotait plus aucun rendu depuis le passage à
`RoadTraffic`. Il invalidait encore toute la page et sa sauvegarde. Il est retiré ; la
circulation, les feux et les collisions restent calculés par le moteur. Le champ de
sauvegarde reste compatible avec les anciennes parties.

## Captures

Images du jeu exécuté localement, et non maquettes générées :

- [PC avant](captures/interface-2026-10-18/before-desktop.png) /
  [PC après, qualité Élevé](captures/interface-2026-10-18/after-high-desktop.png).
- [Android avant](captures/interface-2026-10-18/before-android.png) /
  [Android après, qualité Équilibré](captures/interface-2026-10-18/after-balanced-android.png).

Le navigateur du banc utilise SwiftShader, un rendu logiciel sans carte graphique. Sa
résolution de scène est volontairement de 0,5×, comme auparavant. L'interface demeure à
la résolution du navigateur ; les captures ne représentent pas la netteté d'un vrai GPU.

## Mesures comparables

Référence : `a08efc4b` après intégration des derniers modèles de Claude. Même configuration,
heure 14 h, caméra de suivi, 12 secondes immobile puis 12 secondes en marche. PC : 1440 × 900,
qualité Élevé. Profil Android : 412 × 915, qualité Équilibré, CPU ralenti 4×.
Les mesures finales ont été exécutées sans autre suite de tests concurrente.

| Profil / phase | FPS avant → après | Temps entre images p95, ms | Allocations échantillonnées, Mio/s |
| --- | ---: | ---: | ---: |
| PC immobile | 3,00 → 3,11 | 571,7 → 436,0 | 0,84 → 0,63 |
| PC marche | 2,53 → 2,54 | 510,7 → 704,3 | 1,10 → 0,80 |
| Android simulé immobile | 6,84 → 7,64 | 186,8 → 168,1 | 1,02 → 0,75 |
| Android simulé marche | 6,38 → 6,71 | 292,7 → 233,2 | 1,22 → 1,13 |

Ces échantillons ne démontrent **ni 60 FPS, ni un gain universel**. Le p95 PC en marche
s'est dégradé ; le CPU moyen Android en marche passe de 11,28 à 16,24 ms. Les passages
devant des bâtiments et les arrêts changent aussi le contenu visible, donc les chiffres
en marche doivent être interprétés avec prudence. La prochaine validation graphique
doit se faire sur Android physique et PC avec GPU, avec plusieurs passages identiques.

À l'arrêt, le contenu 3D est comparable : PC 244 057 → 244 079 triangles, 76 → 77 appels ;
Android 128 940 → 128 962 triangles, 40 → 41 appels. Le coût ajouté observé est bien celui
du lot d'ombres, sans suppression de détails. Le compteur cumulé de rendus React de la page
à la fin de la première phase passe de 69 à 22 sur PC et de 71 à 18 sur Android.
Ce compteur inclut le démarrage, il ne mesure pas uniquement les 12 secondes.

Les 16 tuiles initiales prennent au total 131,5 → 128,6 ms de CPU sur PC et
411,8 → 362,6 ms sur Android simulé. Leur p95 augmente respectivement de 43,4 à 48,7 ms
et de 108,7 à 124,6 ms ; leur algorithme n'est pas modifié dans ce chantier.
Le chargement à froid observé est de 5,75 → 5,74 s sur PC et 6,97 → 7,63 s sur Android.
Ces variations ne constituent pas une amélioration garantie du chargement.

Rapports bruts : `docs/captures/engine-performance/visual-{before,after}-*.json`.
Les temps `cpu.render` mesurent la soumission CPU, **pas la durée GPU**.

## Validation et capacité

Le scénario `e2e/lome-interface.spec.ts` contrôle la navigation par hit-testing, la carte,
le retour aux besoins, la continuité du contexte WebGL, la circulation à l'arrêt, les
ombres et les erreurs de shader. Il vérifie également les formats 320 × 640 et 915 × 412.
La configuration `e2e/lome-interface.config.ts` utilise les services locaux isolés.

Validation effectuée : 478 tests unitaires / SQL, 34 de durcissement, compilation TypeScript,
contrôle de sécurité statique et construction Next.js. Les 12 scénarios sélectionnés PC /
Android sont validés après reprise ciblée du bouton de présence, agrandi à 44 px. Les
nouveaux fichiers passent Biome ; le lint des fichiers partagés conserve trois erreurs
sémantiques déjà présentes dans la référence `a08efc4b`, hors de ce changement.

```bash
HAROOLIFE_TEST_PORT=3235 HAROOLIFE_SUPABASE_PORT=54395 \
NEXT_PUBLIC_TURNSTILE_SITE_KEY='' PW_CHROMIUM_PATH=/usr/bin/chromium \
npx playwright test --config=e2e/lome-interface.config.ts \
  -g 'interface:|map and graphics|real relay:|map gestures|market: order once|a returning driver'
```

Le nombre d'acteurs affichés dépend du voisinage de l'instance, jamais du nombre total
de comptes connectés au service. Aucun changement du protocole, des droits SQL, de
l'admission ni de la sauvegarde réseau n'est introduit ici.

**500 000 connexions simultanées restent un objectif non validé.** Le précédent banc
de 2 000 connexions locales ne le prouve pas. Le déploiement Redis privé / multi-relais,
le dimensionnement de Supabase et les essais distribués par paliers sont décrits dans
[le guide de capacité](haroolife-capacity-500k.md). Aucune infrastructure payante n'est
créée ou redimensionnée par cette livraison graphique.
