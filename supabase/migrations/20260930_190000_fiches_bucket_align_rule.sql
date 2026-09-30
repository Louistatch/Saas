-- Aligne la politique de stockage sur la règle que l'application applique déjà.
--
-- /dashboard/marketplace autorise le dépôt à un super_admin OU à l'admin d'une
-- coopérative de niveau faîtière ("Seules les faîtières peuvent uploader des
-- fiches"). La politique initiale n'autorisait que super_admin : un admin de
-- faîtière aurait passé le contrôle visible, puis se serait heurté à un échec
-- RLS sans message compréhensible — un refus tardif et muet.
--
-- La règle est désormais écrite une fois et vraie aux trois bouts : cette
-- fonction, le garde de POST /api/fiches, et l'écran de dépôt.
--
-- Appliqué en production sous le nom `fiches_bucket_align_with_app_rule`.
create or replace function public.can_upload_fiches()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.cooperatives c on c.id = p.cooperative_id
    where p.id = auth.uid()
      and (p.role = 'super_admin' or (p.role = 'cooperative_admin' and c.level = 'faitiere'))
  );
$$;

comment on function public.can_upload_fiches() is
  'Droit de déposer une fiche technique : super_admin, ou admin d''une coopérative de niveau faîtière. Miroir exact du contrôle fait dans /dashboard/marketplace.';

drop policy if exists "fiches files writable by super admin" on storage.objects;
create policy "fiches files writable by publishers" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fiches-techniques' and public.can_upload_fiches());

drop policy if exists "fiches files updatable by super admin" on storage.objects;
create policy "fiches files updatable by publishers" on storage.objects
  for update to authenticated
  using (bucket_id = 'fiches-techniques' and public.can_upload_fiches());

drop policy if exists "fiches files deletable by super admin" on storage.objects;
create policy "fiches files deletable by publishers" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fiches-techniques' and public.can_upload_fiches());
