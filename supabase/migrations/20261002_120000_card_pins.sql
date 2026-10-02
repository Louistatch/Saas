-- Code PIN de carte : émis par un opérateur, remis avec la carte.
--
-- Le numéro de carte est public (QR, page de scan) : il identifie, il ne prouve
-- rien. Le PIN est le secret remis au titulaire avec la carte. Jamais en clair :
-- scrypt avec sel propre à la ligne (voir lib/security/card-pin.ts).
--
-- ACCÈS : RLS activé sans politique, droits retirés à anon et authenticated.
-- Seul service_role (routes /api/auth/card/pin et /api/cards/pin) y touche.
-- Idempotente.

create table if not exists public.card_pins (
  card_number     text primary key,
  member_id       uuid        not null references public.members(id) on delete cascade,
  pin_hash        text        not null,
  salt            text        not null,
  failed_attempts integer     not null default 0 check (failed_attempts >= 0),
  locked_until    timestamptz,
  issued_by       uuid,
  issued_at       timestamptz not null default now()
);

create index if not exists card_pins_member_idx on public.card_pins (member_id);

alter table public.card_pins enable row level security;
revoke all on public.card_pins from anon, authenticated;
