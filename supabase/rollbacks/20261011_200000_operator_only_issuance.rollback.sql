-- Retour arrière de 20261011_200000_operator_only_issuance.sql (politiques d'origine).
DROP POLICY IF EXISTS cards_insert ON public.member_cards;
CREATE POLICY cards_insert ON public.member_cards FOR INSERT TO authenticated
  WITH CHECK ((private.org_admin_access(cooperative_id) OR public.has_partner_org_access(cooperative_id, 'cards.manage'::public.partner_access_scope))
    AND EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_cards.member_id AND m.cooperative_id = member_cards.cooperative_id));

DROP POLICY IF EXISTS templates_admin_write ON public.templates;
CREATE POLICY templates_admin_write ON public.templates FOR ALL TO authenticated
  USING (public.is_coop_admin_or_super(cooperative_id)) WITH CHECK (public.is_coop_admin_or_super(cooperative_id));

DROP POLICY IF EXISTS fiches_admin_read ON public.fiches_techniques;
CREATE POLICY fiches_admin_all ON public.fiches_techniques FOR ALL TO authenticated
  USING (cooperative_id IN (SELECT p.cooperative_id FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('cooperative_admin', 'super_admin')))
  WITH CHECK (cooperative_id IN (SELECT p.cooperative_id FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('cooperative_admin', 'super_admin')));
