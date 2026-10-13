# HarooLife D4+ — recherche, sources et décisions

Consultation : 13 octobre 2026. Depuis cette session, le réseau sortant ne résout ni `vercel.com` ni `socket.io` (WebFetch refusé). Les faits Vercel ci-dessous viennent de **l'outil de documentation officiel Vercel** (index de vercel.com/docs) et d'une recherche web. Les principes Socket.IO viennent de la documentation v4, connue avant cette session, puis **vérifiés par nos propres tests** (`tests/haroolife-realtime-relay.test.ts`). Aucun entretien n'a été mené ; les forums sont des retours d'expérience, pas des normes.

## Vérifié

| Source | Date | Fait retenu | Décision |
|---|---|---|---|
| Vercel changelog « WebSocket support is now in Public Beta » (vercel.com/changelog/websocket-support-is-now-in-public-beta), relayé par @vercel_dev | 22 juin 2026 | Les Vercel Functions acceptent les WebSockets, en bêta publique, Socket.IO compris, sur Fluid compute, même facturation que les autres invocations | Option possible pour le relais, à tester sur notre compte avant toute adoption |
| Vercel docs, `experimental_upgradeWebSocket` (@vercel/functions) | consulté le 13/10/2026 | Upgrade d'un GET en WebSocket dans un Route Handler Next.js ; paquet `ws` requis ; `maxPayload` 256 Kio par défaut | WebSocket brut seulement dans Next ; Socket.IO demande une Function séparée |
| Vercel docs, Socket.IO dans `api/socket-io.ts` | idem | Socket.IO s'exécute dans une Function qui exporte un serveur HTTP ; côté client `transports: ['websocket']` est **obligatoire** (pas de long-polling) | Relais en WebSocket seul : aucun besoin de sessions collantes |
| Vercel docs, WebSockets et durée maximale | idem | La connexion se ferme quand la Function atteint sa durée maximale ; le client doit se reconnecter avec backoff | Reconnexion automatique + rattrapage par curseur conçus dès le départ |
| Vercel docs, diffusion | idem | Les messages restent **épinglés à une instance** ; diffuser entre instances exige un magasin externe | Un seul processus aujourd'hui ; adaptateur partagé requis avant plusieurs instances |
| Ably, « WebSockets on Vercel » (concurrent de Vercel) | 2026 | Durées citées : 300 s par défaut, 800 s Pro/Enterprise, jusqu'à 1 800 s en bêta | **Non vérifié** sur notre compte ; à mesurer en préversion |
| Socket.IO v4, garanties de livraison | doc v4 | Au plus une fois par défaut ; l'accusé de réception (`emitWithAck`) et la persistance relèvent de l'application | Message enregistré en Postgres **avant** diffusion ; ack porteur du message stocké ; renvoi idempotent par `clientId` |
| Socket.IO v4, salons et adaptateurs | doc v4 | Les salons sont côté serveur ; l'adaptateur Redis diffuse entre instances mais **ne restaure pas** les sessions ni les messages manqués | Rattrapage par `seq` en base (`sync:resume`), indépendant de l'adaptateur |
| npm, socket.io / socket.io-client 4.8.4 | publiés le 25/09/2026 | Licence MIT, plus de deux semaines | Versions exactes épinglées |
| Gabriel Gambetta, « Entity interpolation » | article de référence | Afficher les entités distantes un peu dans le passé, entre deux instantanés | Rendu à « maintenant − 220 ms », instantanés à 5 Hz |
| Supabase Realtime, Presence | doc | Presence sert à l'état lent, pas à chaque image | Présence = localité seulement ; positions par instantanés volatils |

## Décisions

1. **Relais Socket.IO séparé** du frontend (`realtime/`), lancé par `npm run realtime`. Il tourne en local et en CI aujourd'hui. Pour la production, deux options attendent votre accord :
   - Function Vercel isolée (bêta WebSocket), dans un projet distinct du site ;
   - service Node toujours actif (par exemple Railway, où tourne déjà AgriTogo).
   Aucun service n'a été provisionné.
2. **Identité vérifiée par le serveur** : le jeton Supabase de la personne est vérifié par Supabase Auth à la connexion. Les fonctions SQL s'exécutent **avec ce jeton** : aucune clé service_role dans le relais.
3. **Persistance d'abord** : migration additive `haroolife_chat_*`, fonctions `SECURITY DEFINER` qui décident des salons, idempotence `(user_id, client_id)`, curseur `seq`, blocage et signalement, clé d'auteur opaque.
4. **Repli** : sans URL de relais ou avec `HAROOLIFE_REALTIME_DISABLED=true`, le jeu garde les messages de canton HTTP existants.
5. **Multijoueur** : déplacement local immédiat, instantanés à 5 Hz seulement si l'avatar bouge (sinon toutes les 2 s), contrôle de vitesse côté serveur (> 14 cellules/s refusé), interpolation côté client, 12 joueurs affichés au plus.

## Risques et alternatives

- Bêta Vercel : durées et limites à mesurer ; coût par connexion longue à chiffrer avec la grille en vigueur.
- Une seule instance : pas de diffusion entre instances tant que l'adaptateur partagé (Redis TLS privé ou Postgres LISTEN/NOTIFY) n'est pas en place. La persistance et le rattrapage, eux, ne dépendent pas de l'instance.
- Supabase Realtime Broadcast/Presence reste une alternative gérée si le relais est indisponible ; non branché, pour éviter un double envoi pendant la migration.
