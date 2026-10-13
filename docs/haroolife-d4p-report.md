# HarooLife D4+ — rapport

Branche locale `feat/haroolife-d4p`, partie de `main` (`e966467`). Commits locaux uniquement : aucun push, aucune PR, aucun déploiement, aucune migration appliquée.

## Modules

| Module | Implémenté | Test desktop | Test mobile simulé | Test Android réel | Test déploiement |
|---|---|---|---|---|---|
| M0 — entrer / sortir de sa maison | oui | oui | oui | non testé | non testé |
| M1 — discussion Socket.IO, présence, joueurs distants | oui (relais local) | oui | oui | non testé | non testé (relais non provisionné) |
| M2 — panneaux 3D, campagnes, statistiques, console | oui | oui | oui | non testé | non testé |
| M4 — endurance GPU, accès LAN | oui | oui | sonde LAN Pixel 7 | non testé | — |

## Commits

| Commit | Contenu |
|---|---|
| `566b08c` | M0 : résolveur de porte unique sur la position continue, HUD, touche E, tests |
| `e9db64b` | M1 : relais Socket.IO, migration du chat, client, téléphone, joueurs distants, tests |
| `98b8d35` | M2 : panneaux 3D, campagnes, API, console d'administration, tests |
| audit | build LAN (CSP), repli d'identifiant, reconnexion sur jeton expiré, endurance, documents |

## Ce qui attend votre accord

1. **Pousser la branche et ouvrir une PR.** La CI (`haroolife-lome-browser.yml`) démarre désormais le relais local pour les tests.
2. **Appliquer les deux migrations** (`20261013_120000_haroolife_realtime_chat.sql`, `20261013_130000_haroolife_ads.sql`) sur une base de test d'abord. Les retours arrière sont prêts.
3. **Héberger le relais.** Deux options, sans aucun service créé à ce jour :
   - une Function Vercel WebSocket (bêta), dans un projet distinct du site. Les connexions se ferment à la durée maximale de la Function ; le client se reconnecte et rattrape par curseur.
   - un service Node toujours actif, par exemple sur Railway où tourne déjà AgriTogo. Environ 135 Mo de mémoire résidente mesurés, à chiffrer avec la grille en vigueur.

   Ensuite il suffit de renseigner `NEXT_PUBLIC_HAROOLIFE_REALTIME_URL` sur Vercel. Sans cette variable, rien ne change en production : le chat en direct reste désactivé et les messages de canton actuels continuent.
4. **Test sur le Motorola**, selon le protocole de `haroolife-d4p-qa.md`.

## Limites connues

- Une seule instance de relais : pas de diffusion entre instances tant qu'aucun adaptateur partagé n'est en place (Redis privé TLS ou Postgres). La persistance et le rattrapage n'en dépendent pas.
- Messages privés (`dm:*`) absents : aucune politique de consentement n'est définie.
- Exposition publicitaire approchée, sans test d'occlusion.
- Aucune vente, aucun paiement, aucun partenaire réel. Les tarifs des panneaux restent des hypothèses (`lome-sponsors.ts`).
- AGROCROWN, cité dans le cahier des charges, n'existe pas dans le dépôt : aucun créatif ne lui a été attribué.

## Prochaines étapes proposées, selon les mesures

1. Test réel sur le Motorola, avec relevé FPS et p95 dans la rue, à la porte, à l'intérieur, en taxi et près d'un panneau.
2. Préversion protégée, après accord, avec le relais hébergé, pour un test à deux téléphones sur 4G.
3. Bulles de discussion au-dessus des avatars distants, puis interactions contextuelles M3 (s'asseoir, travailler, parler), puis zémidjan.
