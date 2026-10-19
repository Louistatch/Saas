# HarooLife D4P — hébergement du relais Socket.IO : Railway ou Vercel WebSocket

Date : 13 octobre 2026. Mise à jour du 15 octobre 2026 : **déployé sur Railway** avec l'accord du
fondateur (voir « Déploiement » en fin de document).

## Ce qu'il faut héberger

`realtime/` est un processus Node toujours actif (Socket.IO 4.8, WebSocket seul, pas de
long-polling). Il garde **en mémoire** la présence par localité, les dernières positions des
joueurs (snapshots à débit limité) et les salons rejoints par chaque socket. Les messages, eux,
sont écrits dans Supabase (fonctions SQL exécutées avec le JWT de la personne) avant diffusion.

Mesuré en local (pas sur l'hébergeur) : 135 Mo de mémoire résidente en mode Supabase (tsx),
419 Mo en mode PGlite (local uniquement, jamais en production). Après un arrêt brutal
(`kill -9`) puis relance, le jeu est revenu « en ligne » 26 s après la commande de relance
(démarrage tsx + attente du backoff client), sans action de l'utilisateur.

## Comparaison

| Critère | Railway (service Node permanent) | Vercel WebSocket (Functions, bêta) |
|---|---|---|
| Fonctionnement réel | Processus unique, connexions illimitées dans le temps. La doc Railway exempte les WebSockets des limites de durée et d'inactivité des requêtes HTTP. Le code actuel tourne tel quel (`npm run realtime`). | Doc Vercel : « les connexions WebSocket se ferment quand la Function atteint sa durée maximale » et « les messages sont épinglés à la même instance ». Plusieurs instances = plusieurs mémoires : la présence et les positions ne se voient plus entre joueurs servis par deux instances, sauf à ajouter un bus partagé (Redis pub/sub). |
| Travail nécessaire | Un service, un `Dockerfile` ou Nixpacks, variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `HAROOLIFE_REALTIME_ORIGINS`. | Réécrire l'entrée en fonction `api/` exportant le serveur HTTP (exemple officiel), vérifier que cela cohabite avec le projet Next.js existant (non vérifié), ajouter l'adaptateur Redis Socket.IO pour la diffusion entre instances et déplacer présence/positions dans Redis. |
| Authentification | Inchangée : jeton Supabase au handshake, revérifié, `auth_expired` puis reconnexion avec jeton rafraîchi (testé). | Identique côté code, mais chaque fermeture à durée maximale relance un handshake donc une vérification du jeton. |
| Reconnexion | Seulement sur coupure réseau ou redéploiement. Client : backoff 1 s → 30 s, file d'attente des messages, reprise par curseur `seq` (testé, y compris arrêt brutal du relais). | Systématique à chaque durée maximale atteinte (valeur selon le plan, non vérifiée ici) en plus des coupures réseau. Le client le supporte, mais l'expérience montre un passage « hors ligne » périodique. |
| Résilience | Point unique : un redémarrage coupe tout le monde ~quelques secondes puis reconnexion automatique. Redémarrage automatique sur échec (politique Railway). Pas de multi-instance sans Redis. | Montée en charge automatique, mais justement incompatible avec l'état en mémoire sans Redis. Produit en **bêta**. |
| Maintenance | Un service de plus à surveiller (logs, métriques, mises à jour Node). Même espace Railway que les services AgriTogo. | Pas de serveur à gérer, mais une dépendance supplémentaire (Redis) et une API bêta susceptible de changer. |
| Coût | Voir ci-dessous : faible et prévisible. | Facturation Fluid compute (CPU actif + mémoire provisionnée pendant toute la durée de connexion) + Redis. Non chiffré : grille de la bêta non vérifiée. |

## Recommandation : Railway

Railway est l'option la plus fiable **pour ce code et cette charge** : il exécute le relais tel
qu'il a été testé, sans fermeture périodique des connexions et sans répartir l'état en mémoire
sur plusieurs instances. Vercel WebSocket deviendrait pertinent seulement si l'on dépasse ce
qu'une instance peut porter ; il faudrait alors de toute façon Redis, et Railway peut aussi passer
à plusieurs réplicas derrière le même adaptateur Redis.

Conditions : le service ne doit pas être mis en veille (les services AgriTogo du même espace
sont actuellement en `SLEEPING`) ; garder `HAROOLIFE_REALTIME_DISABLED=true` comme coupe-circuit ;
`HAROOLIFE_REALTIME_ORIGINS` limité aux domaines FaîtiereHub.

## Coût estimé (projection, pas une facture)

Tarifs Railway publiés : Hobby 5 $/mois incluant 5 $ d'usage ; RAM 10 $/Go/mois ; CPU
20 $/vCPU/mois ; sortie réseau 0,05 $/Go.

| Poste | Hypothèse | Mensuel |
|---|---|---|
| Mémoire | 0,15 Go en continu (135 Mo mesurés en local + marge) | ≈ 1,50 $ |
| CPU | 0,02 vCPU en moyenne (pilote, quelques dizaines de joueurs ; non mesuré sur Railway) | ≈ 0,40 $ |
| Sortie réseau | < 5 Go (messages texte + positions limitées en débit) | < 0,25 $ |
| **Total ressources** | | **≈ 2 à 3 $** |

Avec l'offre Hobby, ce montant est couvert par les 5 $ inclus : la facture serait **5 $/mois**,
partagés avec l'usage AgriTogo du même espace (s'il dépasse, le surplus est facturé). Le plan
actuel du compte Railway n'a pas pu être lu par l'outil : à confirmer dans le tableau de bord.
Aucune ressource n'a été créée.

## Sources

- Vercel, *Functions › WebSockets* (exemple Socket.IO, `transports: ['websocket']`, fermeture à
  la durée maximale, messages épinglés à une instance).
- Railway, *Public networking › Specs and limits* (WebSockets exemptés des délais), *Pricing*.

## Déploiement (15 octobre 2026)

- **Base** : migrations `20261013_120000_haroolife_realtime_chat` et `20261015_130000_haroolife_chat_dm`
  appliquées en production. Tables fermées (RLS, aucun accès direct) ; fonctions réservées aux comptes
  connectés, jamais à `anon`.
- **Relais** : service Railway `haroolife-realtime`, projet `agritogo`, environnement `production`,
  région `europe-west4`, veille désactivée, redémarrage sur échec.
  - Construit par `npm run realtime:build` (un fichier, esbuild), lancé par `npm run realtime:start`.
  - Contrôle de santé : `/health`.
  - Adresse : `https://haroolife-realtime-production.up.railway.app`.
- **Variables du relais** : `SUPABASE_URL`, `SUPABASE_ANON_KEY` (clé publique, jamais la clé
  service_role), `HAROOLIFE_REALTIME_ORIGINS=https://www.faitierehub.com,https://faitierehub.com`,
  `HAROOLIFE_REALTIME_DISABLED=false`.
- **Site (Vercel, production)** : `NEXT_PUBLIC_HAROOLIFE_REALTIME_URL` pointe vers le relais ; la CSP
  (`connect-src`) l'ajoute d'elle-même.
- **Coupe-circuit** : `HAROOLIFE_REALTIME_DISABLED=true` sur le service Railway. Le jeu repasse alors
  aux messages de la place par HTTP, sans redéploiement du site.
- **Retour arrière complet** : retirer la variable côté Vercel, arrêter le service Railway, puis appliquer
  les retours arrière SQL (`supabase/rollbacks/`) dans l'ordre inverse.
