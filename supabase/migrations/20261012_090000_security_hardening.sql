-- Durcissement issu de l'audit investisseur du 11/10/2026 (investor-readiness/technical-audit.md).
-- NON APPLIQUÉE : à valider puis appliquer après accord. Aucune donnée modifiée ni supprimée.
-- Retour arrière : supabase/rollbacks/20261012_090000_security_hardening.rollback.sql

-- 1. Photos de membres : plus de listage public du bucket. Le bucket reste public, donc les
--    adresses publiques des photos déjà affichées (carte, vérification) continuent de marcher ;
--    seule l'énumération de tous les fichiers via l'API Storage est fermée.
DROP POLICY IF EXISTS "Public read member photos" ON storage.objects;

-- 2. Écriture des photos et logos réservée aux administrateurs de l'organisation (et au
--    super_admin) : un simple membre pouvait remplacer ou supprimer les photos des autres.
DROP POLICY IF EXISTS "member photos writable by own org" ON storage.objects;
DROP POLICY IF EXISTS "member photos updatable by own org" ON storage.objects;
DROP POLICY IF EXISTS "member photos deletable by own org" ON storage.objects;
CREATE POLICY "member photos writable by own org" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'member-photos'
    AND private.org_admin_access(((storage.foldername(name))[1])::uuid));
CREATE POLICY "member photos updatable by own org" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'member-photos'
    AND private.org_admin_access(((storage.foldername(name))[1])::uuid));
CREATE POLICY "member photos deletable by own org" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'member-photos'
    AND private.org_admin_access(((storage.foldername(name))[1])::uuid));

DROP POLICY IF EXISTS "cooperative logos writable by own org" ON storage.objects;
DROP POLICY IF EXISTS "cooperative logos updatable by own org" ON storage.objects;
DROP POLICY IF EXISTS "cooperative logos deletable by own org" ON storage.objects;
CREATE POLICY "cooperative logos writable by own org" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cooperative-logos'
    AND private.org_admin_access(((storage.foldername(name))[1])::uuid));
CREATE POLICY "cooperative logos updatable by own org" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'cooperative-logos'
    AND private.org_admin_access(((storage.foldername(name))[1])::uuid));
CREATE POLICY "cooperative logos deletable by own org" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cooperative-logos'
    AND private.org_admin_access(((storage.foldername(name))[1])::uuid));

-- 3. Demandes d'accès : un visiteur ne peut plus rattacher la demande au compte de quelqu'un
--    d'autre (user_id libre) ni la poser déjà « traitée ».
DROP POLICY IF EXISTS contact_messages_public_insert ON public.contact_messages;
CREATE POLICY contact_messages_public_insert ON public.contact_messages FOR INSERT TO public
  WITH CHECK ((user_id IS NULL OR user_id = (SELECT auth.uid())) AND status = 'nouveau');

-- 4. Scores ATS : lisibles par les administrateurs de l'organisation, plus par chaque membre.
DROP POLICY IF EXISTS ats_scores_own_coop_read ON public.member_ats_scores;
CREATE POLICY ats_scores_own_coop_read ON public.member_ats_scores FOR SELECT TO authenticated
  USING (private.org_admin_access(cooperative_id));

-- 5. Hygiène des droits : aucun rôle client n'a besoin de TRUNCATE.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE TRUNCATE ON public.%I FROM anon, authenticated', t.tablename);
  END LOOP;
END $$;

-- 6. Alignement du dépôt sur la production : la fonction n'est plus appelée par l'application
--    et ne doit pas être exécutable par un utilisateur connecté (déjà le cas en production).
REVOKE EXECUTE ON FUNCTION public.bootstrap_cooperative_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
