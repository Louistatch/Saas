-- Image de couverture des comptes d'exploitation (vitrine publique).
-- Image compressée côté navigateur (WebP ~800 px, < 300 Ko), stockée dans un
-- bucket PUBLIC distinct : les documents payants restent dans le bucket privé.
-- Additive et idempotente : aucune suppression.

alter table public.fiches_techniques add column if not exists cover_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fiches-covers', 'fiches-covers', true, 307200, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'fiches_covers_super_admin_write') then
    create policy fiches_covers_super_admin_write on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'fiches-covers'
        and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'super_admin')
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'fiches_covers_super_admin_delete') then
    create policy fiches_covers_super_admin_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'fiches-covers'
        and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'super_admin')
      );
  end if;
end $$;
