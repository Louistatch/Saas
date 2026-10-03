-- Une identité, un profil : le nom vient de `profiles`, jamais des tables Haroo.
--
-- Les tables haroo_{ouvrier,acheteur,agronome}_profiles recopient first_name /
-- last_name (lus par la carte Haroo et le scanner public). Ces colonnes
-- deviennent un MIROIR de profiles :
--  - toute modification du nom dans profiles est propagée aux extensions Haroo ;
--  - une écriture directe du nom dans une table Haroo est remplacée par celui
--    du profil (le nom ne se modifie qu'à un seul endroit).
-- Les données métier Haroo (compétences, disponibilité, produits, zone…) et le
-- téléphone / la photo de la carte restent dans l'extension Haroo.
-- Vérifié avant migration : 6/6 profils Haroo identiques à profiles.
-- Additive et idempotente : aucune colonne ni donnée supprimée.

create or replace function private.haroo_name_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select first_name, last_name into p from public.profiles where id = new.user_id;
  if found then
    new.first_name := coalesce(nullif(trim(p.first_name), ''), new.first_name);
    new.last_name := coalesce(nullif(trim(p.last_name), ''), new.last_name);
  end if;
  return new;
end;
$$;

drop trigger if exists haroo_ouvrier_name_from_profile on public.haroo_ouvrier_profiles;
create trigger haroo_ouvrier_name_from_profile
  before insert or update of first_name, last_name, user_id on public.haroo_ouvrier_profiles
  for each row execute function private.haroo_name_from_profile();

drop trigger if exists haroo_acheteur_name_from_profile on public.haroo_acheteur_profiles;
create trigger haroo_acheteur_name_from_profile
  before insert or update of first_name, last_name, user_id on public.haroo_acheteur_profiles
  for each row execute function private.haroo_name_from_profile();

drop trigger if exists haroo_agronome_name_from_profile on public.haroo_agronome_profiles;
create trigger haroo_agronome_name_from_profile
  before insert or update of first_name, last_name, user_id on public.haroo_agronome_profiles
  for each row execute function private.haroo_name_from_profile();

create or replace function private.profile_name_to_haroo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name then
    update public.haroo_ouvrier_profiles set first_name = new.first_name, last_name = new.last_name where user_id = new.id;
    update public.haroo_acheteur_profiles set first_name = new.first_name, last_name = new.last_name where user_id = new.id;
    update public.haroo_agronome_profiles set first_name = new.first_name, last_name = new.last_name where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profile_name_to_haroo on public.profiles;
create trigger profile_name_to_haroo
  after update of first_name, last_name on public.profiles
  for each row execute function private.profile_name_to_haroo();

revoke all on function private.haroo_name_from_profile() from public;
revoke all on function private.profile_name_to_haroo() from public;
