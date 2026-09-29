-- Storage bucket for organisation emblems (faîtière and cooperative logos),
-- printed on every member card by lib/card-engine/renderer.ts and shown on the
-- public /verify and /embed pages.
--
-- Applied to production as migration `cooperative_logos_bucket`. Kept here so
-- the repo stays the record of what the database actually is — the Kobo
-- ingestion bug of 20260929_120000 hid for months precisely because a migration
-- file existed that had never run.
--
-- Public on read: the logo appears on public pages, so there is nothing to
-- gate. Writes are scoped by folder — the first path segment is the
-- cooperative id, checked against get_accessible_cooperative_ids().

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cooperative-logos', 'cooperative-logos', true, 524288,
  ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 524288,
      allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'];

DROP POLICY IF EXISTS "cooperative logos are publicly readable" ON storage.objects;
CREATE POLICY "cooperative logos are publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'cooperative-logos');

DROP POLICY IF EXISTS "cooperative logos writable by own org" ON storage.objects;
CREATE POLICY "cooperative logos writable by own org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cooperative-logos'
    AND (storage.foldername(name))[1]::uuid = ANY(get_accessible_cooperative_ids())
  );

DROP POLICY IF EXISTS "cooperative logos updatable by own org" ON storage.objects;
CREATE POLICY "cooperative logos updatable by own org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cooperative-logos'
    AND (storage.foldername(name))[1]::uuid = ANY(get_accessible_cooperative_ids())
  );

DROP POLICY IF EXISTS "cooperative logos deletable by own org" ON storage.objects;
CREATE POLICY "cooperative logos deletable by own org" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'cooperative-logos'
    AND (storage.foldername(name))[1]::uuid = ANY(get_accessible_cooperative_ids())
  );
