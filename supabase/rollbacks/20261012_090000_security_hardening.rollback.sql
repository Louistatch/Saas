-- Retour arrière de 20261012_090000_security_hardening.sql : politiques d'origine (relevées en
-- production le 11/10/2026). Les droits TRUNCATE ne sont pas restaurés (aucun usage client).
CREATE POLICY "Public read member photos" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'member-photos');

DROP POLICY IF EXISTS "member photos writable by own org" ON storage.objects;
DROP POLICY IF EXISTS "member photos updatable by own org" ON storage.objects;
DROP POLICY IF EXISTS "member photos deletable by own org" ON storage.objects;
CREATE POLICY "member photos writable by own org" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'member-photos') AND (((storage.foldername(name))[1] IN (SELECT (c.c)::text FROM unnest(get_accessible_cooperative_ids()) c(c))) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'))));
CREATE POLICY "member photos updatable by own org" ON storage.objects FOR UPDATE TO authenticated
  USING ((bucket_id = 'member-photos') AND (((storage.foldername(name))[1] IN (SELECT (c.c)::text FROM unnest(get_accessible_cooperative_ids()) c(c))) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'))));
CREATE POLICY "member photos deletable by own org" ON storage.objects FOR DELETE TO authenticated
  USING ((bucket_id = 'member-photos') AND (((storage.foldername(name))[1] IN (SELECT (c.c)::text FROM unnest(get_accessible_cooperative_ids()) c(c))) OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'))));

DROP POLICY IF EXISTS "cooperative logos writable by own org" ON storage.objects;
DROP POLICY IF EXISTS "cooperative logos updatable by own org" ON storage.objects;
DROP POLICY IF EXISTS "cooperative logos deletable by own org" ON storage.objects;
CREATE POLICY "cooperative logos writable by own org" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'cooperative-logos') AND (((storage.foldername(name))[1])::uuid = ANY (get_accessible_cooperative_ids())));
CREATE POLICY "cooperative logos updatable by own org" ON storage.objects FOR UPDATE TO authenticated
  USING ((bucket_id = 'cooperative-logos') AND (((storage.foldername(name))[1])::uuid = ANY (get_accessible_cooperative_ids())));
CREATE POLICY "cooperative logos deletable by own org" ON storage.objects FOR DELETE TO authenticated
  USING ((bucket_id = 'cooperative-logos') AND (((storage.foldername(name))[1])::uuid = ANY (get_accessible_cooperative_ids())));

DROP POLICY IF EXISTS contact_messages_public_insert ON public.contact_messages;
CREATE POLICY contact_messages_public_insert ON public.contact_messages FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS ats_scores_own_coop_read ON public.member_ats_scores;
CREATE POLICY ats_scores_own_coop_read ON public.member_ats_scores FOR SELECT TO public
  USING (cooperative_id IN (SELECT profiles.cooperative_id FROM profiles WHERE profiles.id = auth.uid()));
