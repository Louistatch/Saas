# HarooLife D4+ — architecture temps réel et interactions

## Portes (M0)

```
PlayerController (pose continue, 60 Hz)
      │  toutes les 140 ms, et au toucher « Entrer » / touche E
      ▼
resolveInteraction(cityLife, pose, cible affichée, choix, orientation)
      │  emprise des bâtiments voisins, rayon 1,0 (entrée) / 1,35 (hystérésis)
      ▼
InteractionTarget ── estate → enterBuilding(life, bâtiment)
                  └─ lot    → enterLot(cityLife, lot, pose devant la porte)
```

## Messagerie et présence (M1)

```
Navigateur (jeu)                      Relais Socket.IO (realtime/)               Postgres (Supabase)
────────────────                      ───────────────────────────               ───────────────────
RealtimeClient ──WebSocket seul──▶ io.use : Supabase Auth getUser(jeton)
  boîte d'envoi (clientId)            haroolife_chat_me() avec le jeton ───────▶ salons autorisés
  curseurs seq par salon              join(salons) + user:<clé>
  chat:send ─────────────────────▶ Zod, débit, salon ∈ me.rooms
                                      haroolife_chat_send(jeton) ─────────────▶ INSERT idempotent
  ◀──── ack {message stocké} ──────── puis io.to(salon).emit('chat:new')
  sync:resume {curseurs} ─────────▶ haroolife_chat_history(après seq) ───────▶ messages manqués
  presence:join {localité} ───────▶ mémoire de l'instance, here:<localité>
  player:pose (5 Hz, volatil) ────▶ contrôle de vitesse → here:<localité>
RemotePlayers ◀── player:snapshot ── (volatil, jamais stocké)
  interpolation à maintenant − 220 ms
```

### Tables (migration `20261013_120000_haroolife_realtime_chat.sql`, non appliquée en production)

| Table | Rôle | Accès direct des comptes |
|---|---|---|
| `haroolife_chat_messages` | id, `seq` (curseur), room, user_id, body ≤ 500, `client_id` unique par auteur, edited_at, deleted_at | Aucun (RLS activée, droits retirés) |
| `haroolife_chat_reports` | signalements, un par message et par personne | Aucun |
| `haroolife_chat_blocks` | blocages d'auteur | Aucun |

Fonctions exposées aux comptes : `haroolife_chat_me`, `_send`, `_history`, `_edit`, `_delete`, `_report`, `_block`. Toutes lisent `auth.uid()`. Les droits passent par `private.haroolife_chat_allowed`, fondée sur `profiles` (seule source d'autorité) et `haroolife_residents`.

### Salons

| Salon | Lire | Écrire |
|---|---|---|
| `world:togo`, `locality:lome`, `locality:kara` | tout compte actif | avoir une maison HarooLife |
| `canton:<id>` | y habiter | y habiter |
| `coop:<id>` | membre ou admin de cette coopérative | idem |
| `dm:*` | absent : aucune politique de consentement définie | — |

super_admin : lecture, écriture et effacement partout (modération).

### Évènements (protocole v1, `lib/haroolife/realtime/protocol.ts`)

`chat:send` (ack), `chat:new`, `chat:edit`, `chat:delete`, `chat:history`, `chat:typing`, `chat:report`, `chat:block`, `sync:resume`, `presence:join`, `presence:leave`, `player:pose`, `player:snapshot`, `system:hello`, `system:error`.

### Sécurité

- Pas d'identité choisie par le client : la clé d'auteur vient de la base, sous forme de hachage opaque, jamais l'identifiant du compte.
- Charge utile limitée à 16 Kio ; corps ≤ 500 caractères, sans caractères de contrôle. Débit : 8 messages par 10 s par socket, 20 par minute en base.
- Le texte est affiché comme texte par React : aucun HTML interprété (testé avec `<img onerror>`).
- CSP `connect-src` ouverte au seul relais configuré (`NEXT_PUBLIC_HAROOLIFE_REALTIME_URL`).
- Coupe-circuit `HAROOLIFE_REALTIME_DISABLED=true` : refus immédiat des connexions, et le client s'arrête sans réessayer en boucle.

### Variables

| Où | Variable | Rôle |
|---|---|---|
| Next.js (build) | `NEXT_PUBLIC_HAROOLIFE_REALTIME_URL` | URL publique du relais ; absente = désactivé |
| Relais | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Vérification des jetons et appels SQL avec le jeton |
| Relais | `HAROOLIFE_REALTIME_ORIGINS` | Origines autorisées |
| Relais | `HAROOLIFE_REALTIME_DISABLED` | Coupe-circuit |
| Relais (local) | `HAROOLIFE_REALTIME_REPO=pglite` | Vraie migration dans PGlite ; refusé en production |
