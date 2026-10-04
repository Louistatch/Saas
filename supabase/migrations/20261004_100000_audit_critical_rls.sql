-- Audit du 04/10/2026 — failles critiques C3 à C7 (règles d'accès).
-- Aucune donnée supprimée : on retire ou resserre des politiques RLS.
-- Les écritures serveur (service_role, AgriTogo) contournent RLS et ne
-- sont pas touchées.

-- ── C3 · ai_conversations : lisible et écrivable par n'importe qui ──────
-- Écrit et lu uniquement côté serveur (service_role : routes /api/ai/*,
-- AgriTogo). La lecture admin est restreinte au super_admin plus bas.
DROP POLICY IF EXISTS ai_conv_select_open ON public.ai_conversations;
DROP POLICY IF EXISTS ai_conv_insert_open ON public.ai_conversations;
DROP POLICY IF EXISTS ai_conv_insert_public ON public.ai_conversations;

-- Admin ayant accès à cette coopérative (la sienne ou une coopérative fille
-- d'une faîtière/union, comme assertTenantAccess côté serveur), ou
-- super_admin (qui n'a pas de coopérative : has_org_access seul l'excluait).
CREATE OR REPLACE FUNCTION public.is_coop_admin_or_super(target_coop uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (p.role = 'super_admin'
           OR (p.role = 'cooperative_admin'
               AND target_coop = ANY (public.get_accessible_cooperative_ids())))
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_coop_admin_or_super(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_coop_admin_or_super(uuid) TO authenticated;

-- ── C4 · integrations : lisible par tout compte, modifiable entre coops ─
DROP POLICY IF EXISTS integrations_authenticated_read ON public.integrations;
DROP POLICY IF EXISTS integrations_admin_write ON public.integrations;
CREATE POLICY integrations_admin_all ON public.integrations
  FOR ALL TO authenticated
  USING (public.is_coop_admin_or_super(cooperative_id))
  WITH CHECK (public.is_coop_admin_or_super(cooperative_id));

-- ── C5 · données Kobo lisibles par tout compte connecté ─────────────────
DROP POLICY IF EXISTS kobo_submissions_read ON public.kobo_submissions;
CREATE POLICY kobo_submissions_read ON public.kobo_submissions
  FOR SELECT TO authenticated USING (public.is_coop_admin_or_super(cooperative_id));
DROP POLICY IF EXISTS kobo_sync_logs_read ON public.kobo_sync_logs;
CREATE POLICY kobo_sync_logs_read ON public.kobo_sync_logs
  FOR SELECT TO authenticated USING (public.is_coop_admin_or_super(cooperative_id));
DROP POLICY IF EXISTS kobo_field_mappings_read ON public.kobo_field_mappings;
CREATE POLICY kobo_field_mappings_read ON public.kobo_field_mappings
  FOR SELECT TO authenticated USING (public.is_coop_admin_or_super(cooperative_id));

-- ── C6 · profils Haroo (téléphones) lisibles sans compte ────────────────
-- Chaque titulaire lit sa fiche ; le super_admin garde son accès via
-- *_admin_write ; annuaire, cartes et vérification passent par le serveur.
DROP POLICY IF EXISTS haroo_ouvrier_profiles_public_read ON public.haroo_ouvrier_profiles;
DROP POLICY IF EXISTS haroo_acheteur_profiles_public_read ON public.haroo_acheteur_profiles;
DROP POLICY IF EXISTS haroo_agronome_profiles_public_read ON public.haroo_agronome_profiles;
CREATE POLICY haroo_ouvrier_profiles_own_read ON public.haroo_ouvrier_profiles
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY haroo_acheteur_profiles_own_read ON public.haroo_acheteur_profiles
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY haroo_agronome_profiles_own_read ON public.haroo_agronome_profiles
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- ── C7 · crédit : tout membre pouvait approuver ses propres crédits ─────
DROP POLICY IF EXISTS "credit own coop" ON public.credit_applications;
CREATE POLICY credit_applications_admin_all ON public.credit_applications
  FOR ALL TO authenticated
  USING (public.is_coop_admin_or_super(cooperative_id))
  WITH CHECK (public.is_coop_admin_or_super(cooperative_id));

DROP POLICY IF EXISTS "repayments via app" ON public.credit_repayments;
CREATE POLICY credit_repayments_admin_all ON public.credit_repayments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.credit_applications a
                 WHERE a.id = credit_repayments.application_id
                   AND public.is_coop_admin_or_super(a.cooperative_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.credit_applications a
                      WHERE a.id = credit_repayments.application_id
                        AND public.is_coop_admin_or_super(a.cooperative_id)));

-- Les politiques d'écriture Kobo (FOR ALL, donc aussi lecture) acceptaient
-- n'importe quel admin, toutes coopératives confondues.
DROP POLICY IF EXISTS kobo_submissions_write ON public.kobo_submissions;
CREATE POLICY kobo_submissions_write ON public.kobo_submissions
  FOR ALL TO authenticated
  USING (public.is_coop_admin_or_super(cooperative_id))
  WITH CHECK (public.is_coop_admin_or_super(cooperative_id));
DROP POLICY IF EXISTS kobo_sync_logs_write ON public.kobo_sync_logs;
CREATE POLICY kobo_sync_logs_write ON public.kobo_sync_logs
  FOR ALL TO authenticated
  USING (public.is_coop_admin_or_super(cooperative_id))
  WITH CHECK (public.is_coop_admin_or_super(cooperative_id));
DROP POLICY IF EXISTS kobo_field_mappings_write ON public.kobo_field_mappings;
CREATE POLICY kobo_field_mappings_write ON public.kobo_field_mappings
  FOR ALL TO authenticated
  USING (public.is_coop_admin_or_super(cooperative_id))
  WITH CHECK (public.is_coop_admin_or_super(cooperative_id));

-- Conversations IA : rattachées à un numéro de carte, pas à une
-- coopérative ; un admin de coopérative lisait celles de tout le monde.
DROP POLICY IF EXISTS ai_conv_select_admin ON public.ai_conversations;
CREATE POLICY ai_conv_select_admin ON public.ai_conversations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'));
