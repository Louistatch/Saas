-- Missions Haroo : privées, liées à la carte agronome (PIN), chiffres réels.
--
-- 1. FUITE CORRIGÉE : `haroo_missions_public_read` rendait toutes les missions
--    (nom de l'exploitant, budget, dates) lisibles par n'importe qui. Les
--    missions ne sont plus lisibles que par l'agronome concerné, le demandeur
--    et le super-admin. Les écritures passent par les routes serveur
--    (service_role), qui contrôlent la carte et le PIN.
-- 2. Demandeur, dates et avis sur la mission.
-- 3. PIN de la carte agronome (`haroo_card_pins`) : même principe que
--    `card_pins` (hash scrypt + poivre serveur, verrouillage progressif), mais
--    rattaché au profil agronome et non à un membre de coopérative.
-- 4. nombre_missions / note_moyenne deviennent des chiffres CALCULÉS (missions
--    terminées, moyenne des avis) au lieu de valeurs saisies à la main.
--    Recalcul immédiat : les valeurs saisies (23 missions, 4,8/5) sont
--    remplacées par les vraies (0 mission terminée, aucun avis).

-- 2. Colonnes
alter table public.haroo_missions
  add column if not exists requester_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists requester_phone text,
  add column if not exists culture text,
  add column if not exists accepted_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists rating smallint check (rating between 1 and 5),
  add column if not exists review text,
  add column if not exists updated_at timestamptz not null default now();
create index if not exists haroo_missions_agronome_idx on public.haroo_missions (agronome_id);
create index if not exists haroo_missions_requester_idx on public.haroo_missions (requester_user_id);

-- 1. Lecture : agronome concerné, demandeur, super-admin
drop policy if exists haroo_missions_public_read on public.haroo_missions;
drop policy if exists haroo_missions_party_read on public.haroo_missions;
create policy haroo_missions_party_read on public.haroo_missions
  for select to authenticated
  using (
    requester_user_id = (select auth.uid())
    or exists (
      select 1 from public.haroo_agronome_profiles a
      where a.id = haroo_missions.agronome_id and a.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'super_admin'
    )
  );
revoke insert, update, delete on public.haroo_missions from anon, authenticated;

-- 3. PIN de la carte agronome (service_role uniquement : RLS sans politique)
create table if not exists public.haroo_card_pins (
  card_number text primary key,
  agronome_id uuid not null references public.haroo_agronome_profiles(id) on delete cascade,
  pin_hash text not null,
  salt text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  issued_by uuid,
  issued_at timestamptz not null default now()
);
alter table public.haroo_card_pins enable row level security;
revoke all on public.haroo_card_pins from anon, authenticated;

-- 4. Compteurs calculés
create or replace function private.haroo_agronome_refresh_stats(p_agronome uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.haroo_agronome_profiles a
  set nombre_missions = s.done,
      note_moyenne = coalesce(s.avg_rating, 0),
      updated_at = now()
  from (
    select count(*) filter (where statut = 'TERMINEE') as done,
           round(avg(rating)::numeric, 2) as avg_rating
    from public.haroo_missions where agronome_id = p_agronome
  ) s
  where a.id = p_agronome;
$$;

create or replace function private.haroo_missions_stats_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.haroo_agronome_refresh_stats(coalesce(new.agronome_id, old.agronome_id));
  return null;
end;
$$;

drop trigger if exists haroo_missions_stats on public.haroo_missions;
create trigger haroo_missions_stats
  after insert or update or delete on public.haroo_missions
  for each row execute function private.haroo_missions_stats_trigger();

revoke all on function private.haroo_agronome_refresh_stats(uuid) from public;
revoke all on function private.haroo_missions_stats_trigger() from public;

select private.haroo_agronome_refresh_stats(id) from public.haroo_agronome_profiles;
