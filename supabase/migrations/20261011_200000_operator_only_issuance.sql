-- Les coopératives n'émettent plus de cartes, de modèles ni de comptes d'exploitation : c'est le
-- travail de l'opérateur (mandat partenaire cards.manage) et du super_admin. La lecture reste.
-- Aucune donnée touchée. Retour arrière : supabase/rollbacks/20261011_200000_operator_only_issuance.rollback.sql.

DROP POLICY IF EXISTS cards_insert ON public.member_cards;
CREATE POLICY cards_insert ON public.member_cards FOR INSERT TO authenticated
  WITH CHECK (
    (EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin' AND p.deleted_at IS NULL)
     OR public.has_partner_org_access(cooperative_id, 'cards.manage'::public.partner_access_scope))
    AND EXISTS (SELECT 1 FROM public.members m
                WHERE m.id = member_cards.member_id AND m.cooperative_id = member_cards.cooperative_id)
  );

DROP POLICY IF EXISTS templates_admin_write ON public.templates;
CREATE POLICY templates_admin_write ON public.templates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'));

-- fiches_super_admin_all garde l'écriture du super_admin ; la coopérative garde la lecture.
DROP POLICY IF EXISTS fiches_admin_all ON public.fiches_techniques;
CREATE POLICY fiches_admin_read ON public.fiches_techniques FOR SELECT TO authenticated
  USING (cooperative_id IN (SELECT p.cooperative_id FROM public.profiles p
         WHERE p.id = (SELECT auth.uid()) AND p.role IN ('cooperative_admin', 'super_admin')));
