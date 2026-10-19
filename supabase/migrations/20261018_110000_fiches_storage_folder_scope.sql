-- Fichiers des comptes d'exploitation : chaque auteur écrit dans SON dossier.
--
-- NON APPLIQUÉE automatiquement. Les politiques du bucket privé
-- fiches-techniques ne testaient que can_upload_fiches(), sans regarder le
-- dossier : un admin de faîtière pouvait écraser ou supprimer
-- plateforme/<fichier>.xlsx, vendu par la plateforme, ou les fichiers d'une
-- autre faîtière. Désormais :
--   - plateforme/…            → super_admin uniquement ;
--   - <cooperative_id>/…      → admins de CETTE faîtière (et super_admin) ;
--   - tout autre dossier      → personne depuis le navigateur.
-- Aucune politique SELECT n'est ajoutée : la lecture reste réservée aux URL
-- signées émises par le serveur. Les chemins enregistrés sur une fiche sont
-- en outre recontrôlés côté serveur (lib/fiches/files.ts).

create or replace function public.can_write_fiche_folder(folder text)
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
    where p.id = (select auth.uid())
      and (
        p.role = 'super_admin'
        or (
          p.role = 'cooperative_admin'
          and c.level = 'faitiere'
          and folder is not null
          and folder = p.cooperative_id::text
        )
      )
  );
$$;

comment on function public.can_write_fiche_folder(text) is
  'Droit d''écrire dans un dossier du bucket fiches-techniques : super_admin partout (dont plateforme/), admin de faîtière dans le dossier de SA faîtière uniquement.';

revoke all on function public.can_write_fiche_folder(text) from public, anon;
grant execute on function public.can_write_fiche_folder(text) to authenticated, service_role;

drop policy if exists "fiches files writable by publishers" on storage.objects;
create policy "fiches files writable by publishers" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fiches-techniques'
    and public.can_write_fiche_folder((storage.foldername(name))[1])
  );

drop policy if exists "fiches files updatable by publishers" on storage.objects;
create policy "fiches files updatable by publishers" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'fiches-techniques'
    and public.can_write_fiche_folder((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'fiches-techniques'
    and public.can_write_fiche_folder((storage.foldername(name))[1])
  );

drop policy if exists "fiches files deletable by publishers" on storage.objects;
create policy "fiches files deletable by publishers" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fiches-techniques'
    and public.can_write_fiche_folder((storage.foldername(name))[1])
  );
