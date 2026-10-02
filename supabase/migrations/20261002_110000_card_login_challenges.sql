-- Défis de connexion par carte : un code SMS à usage unique par demande.
--
-- Le numéro de carte identifie le membre mais ne l'authentifie pas : il figure
-- dans le QR et sur la page publique de scan. La preuve que l'on tient la carte
-- est un code à six chiffres reçu sur le téléphone enregistré pour ce membre.
-- Cette table en garde la trace pour que le code soit :
--   - à usage unique   (consumed_at) ;
--   - de courte durée  (expires_at, dix minutes) ;
--   - limité en essais (attempts) ;
--   - jamais stocké en clair (code_hash : HMAC, voir lib/security/card-session.ts).
-- Les mêmes lignes servent à compter les demandes par carte et par source
-- (ip_hash), ce qui évite de dépendre d'un Redis pour borner les abus : le
-- limiteur en mémoire des fonctions serverless ne l'est pas d'une instance à
-- l'autre.
--
-- ACCÈS : RLS activé SANS politique, et droits retirés à anon et authenticated.
-- Seul service_role (routes /api/auth/card/*) y touche. Une table sans RLS du
-- schéma public est exposée par PostgREST avec les droits par défaut — on l'a
-- constaté sur les tables d'ingestion CPC, où anon avait INSERT, UPDATE, DELETE
-- et TRUNCATE.
--
-- Idempotente.

create table if not exists public.card_login_challenges (
  id            uuid primary key default gen_random_uuid(),
  card_number   text        not null,
  member_id     uuid        not null references public.members(id) on delete cascade,
  code_hash     text        not null,
  -- IP pseudonymisée (HMAC) : on compte les demandes d'une même source sans
  -- conserver l'adresse.
  ip_hash       text,
  attempts      integer     not null default 0 check (attempts >= 0),
  sent_at       timestamptz,
  consumed_at   timestamptz,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists card_login_challenges_card_idx
  on public.card_login_challenges (card_number, created_at desc);
create index if not exists card_login_challenges_ip_idx
  on public.card_login_challenges (ip_hash, created_at desc) where ip_hash is not null;
-- Purge des défis anciens.
create index if not exists card_login_challenges_created_idx
  on public.card_login_challenges (created_at);

alter table public.card_login_challenges enable row level security;
revoke all on table public.card_login_challenges from anon, authenticated;

comment on table public.card_login_challenges is
  'Codes SMS à usage unique de la connexion par carte. service_role uniquement. Le code n''est jamais stocké en clair.';
