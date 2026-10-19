-- Fichiers des comptes d'exploitation : écriture du bucket privé réservée au
-- super_admin, quel que soit le dossier.
--
-- NON APPLIQUÉE automatiquement. Les politiques du bucket privé
-- fiches-techniques ne testaient que can_upload_fiches(), sans regarder le
-- dossier : un admin de faîtière pouvait écraser ou supprimer
-- plateforme/<fichier>.xlsx, vendu par la plateforme, ou les fichiers d'une
-- autre faîtière. Depuis 40c06ee (main, « comptes d'exploitation émis par
-- l'opérateur »), seul le super_admin publie : la RLS de fiches_techniques
-- (20261011_200000_operator_only_issuance) ne laisse aux faîtières que la
-- lecture, et l'application est fermée (lib/fiches/publishing.ts,
-- FAITIERE_PUBLISHING = false). Le stockage suit la même règle :
--   - tout dossier (plateforme/…, <faîtière>/…) → super_admin uniquement (il
--     publie aussi pour une faîtière, dans le dossier de celle-ci) ;
--   - les autres comptes → rien depuis le navigateur.
-- Le paramètre `folder` est gardé pour la réouverture décrite plus bas.
-- Aucune politique SELECT n'est ajoutée : la lecture reste réservée aux URL
-- signées émises par le serveur. Les chemins enregistrés sur une fiche sont
-- en outre recontrôlés côté serveur (lib/fiches/files.ts).
--
-- Rouvrir la publication des faîtières (décision du propriétaire) : passer
-- FAITIERE_PUBLISHING à true, rouvrir l'écriture de fiches_techniques aux
-- faîtières dans la RLS ET ajouter ici la branche « cooperative_admin d'une
-- faîtière, dans le dossier de SA faîtière » (folder = p.cooperative_id::text).
--
-- Renommée (ex-20261018_110000) pour passer après les migrations de main.
-- Idempotente. Sans effet sur le code de main encore en ligne : il ne dépose
-- des fichiers que pour le super_admin.

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
    where p.id = (select auth.uid())
      and p.role = 'super_admin'
  );
$$;

comment on function public.can_write_fiche_folder(text) is
  'Droit d''écrire dans un dossier du bucket fiches-techniques : super_admin uniquement (plateforme/ et dossiers des faîtières). Publication des faîtières fermée depuis 40c06ee.';

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
