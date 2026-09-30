-- Bucket de stockage des comptes d'exploitation et itinéraires techniques.
--
-- Il était déjà référencé par le code (app/dashboard/templates appelle
-- storage.from('fiches-techniques').remove()) mais n'avait jamais été créé.
--
-- PRIVÉ, délibérément : ces fichiers sont un produit. La lecture passe
-- exclusivement par une URL signée émise côté serveur après contrôle d'accès
-- (app/api/fiches/[id]/access). Aucune politique SELECT n'est donc accordée à
-- anon ou authenticated — un bucket public exposerait le catalogue entier à
-- quiconque devine une URL.
--
-- Le téléversement se fait en revanche directement depuis le navigateur : une
-- route API Vercel plafonne le corps de requête à ~4,5 Mo, ce qui exclut un
-- itinéraire technique un peu fourni. D'où une politique d'écriture plutôt
-- qu'un passage par le serveur.
--
-- Appliqué en production sous le nom `fiches_techniques_bucket`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fiches-techniques', 'fiches-techniques', false, 26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/csv',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = 26214400,
      allowed_mime_types = excluded.allowed_mime_types;

-- Écriture réservée aux super_admin. `profiles` est la seule source de vérité
-- pour l'autorisation (voir CLAUDE.md) : ni app_metadata ni user_metadata.
drop policy if exists "fiches files writable by super admin" on storage.objects;
create policy "fiches files writable by super admin" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fiches-techniques'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

drop policy if exists "fiches files updatable by super admin" on storage.objects;
create policy "fiches files updatable by super admin" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'fiches-techniques'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

drop policy if exists "fiches files deletable by super admin" on storage.objects;
create policy "fiches files deletable by super admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fiches-techniques'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );
