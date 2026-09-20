-- Keep the organisation hierarchy and delegated operator model. No business rows deleted.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Non-exposed helpers avoid recursive profiles policies. Authority comes from profiles.
CREATE OR REPLACE FUNCTION private.org_admin_access(target_coop uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
    AND p.deleted_at IS NULL AND (p.role = 'super_admin' OR
    (p.role = 'cooperative_admin' AND target_coop = ANY(public.get_accessible_cooperative_ids()))));
$$;
CREATE OR REPLACE FUNCTION private.owns_member(target_coop uuid, member_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id = u.id
    WHERE u.id = (SELECT auth.uid()) AND u.email_confirmed_at IS NOT NULL
      AND p.deleted_at IS NULL AND p.role = 'member' AND p.cooperative_id = target_coop
      AND lower(u.email) = lower(member_email));
$$;
REVOKE ALL ON FUNCTION private.org_admin_access(uuid), private.owns_member(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.org_admin_access(uuid), private.owns_member(uuid,text) TO authenticated, service_role;

-- Membership alone is insufficient: certification, active partner, mandate and scope are required.
CREATE OR REPLACE FUNCTION public.has_partner_org_access(target_coop uuid, required_scope public.partner_access_scope DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_organization_assignments a
    JOIN public.partners p ON p.id = a.partner_id
    JOIN public.partner_memberships m ON m.partner_id = p.id
    JOIN public.partner_certifications c ON c.partner_id = p.id AND c.user_id = m.user_id
    WHERE m.user_id = (SELECT auth.uid()) AND m.status = 'active'
      AND p.status IN ('certified','active') AND c.certified_at IS NOT NULL
      AND a.cooperative_id = target_coop AND a.status = 'active'
      AND a.started_at <= now() AND (a.ended_at IS NULL OR a.ended_at > now())
      AND (required_scope IS NULL OR EXISTS (SELECT 1 FROM public.partner_assignment_scopes s
        WHERE s.assignment_id = a.id AND s.scope = required_scope)));
$$;
REVOKE ALL ON FUNCTION public.has_partner_org_access(uuid,public.partner_access_scope) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_partner_org_access(uuid,public.partner_access_scope) TO authenticated, service_role;

-- Remove every legacy permissive policy on the audited tables: policies combine with OR.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('members','member_cards','payments','buyer_requests','buyer_matches','profiles','academy_quiz_options')
  LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
END $$;
REVOKE ALL ON public.members, public.member_cards, public.payments, public.buyer_requests,
  public.buyer_matches, public.profiles, public.academy_quiz_options FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members, public.member_cards, public.buyer_requests TO authenticated;
GRANT SELECT ON public.payments TO authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.buyer_matches TO authenticated;
GRANT UPDATE(status) ON public.buyer_matches TO authenticated;
-- Corrections remain server-only; safe quiz options can still be queried explicitly.
GRANT SELECT(id,question_id,label,order_index,created_at) ON public.academy_quiz_options TO authenticated;
CREATE POLICY quiz_safe_options ON public.academy_quiz_options FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_scoped_read ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR private.org_admin_access(cooperative_id));
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR private.org_admin_access(NULL))
  WITH CHECK (id = (SELECT auth.uid()) OR private.org_admin_access(NULL));
-- Existing protect_profile_privileges trigger continues to guard role/organisation changes.

CREATE POLICY members_read ON public.members FOR SELECT TO authenticated USING (
  private.org_admin_access(cooperative_id) OR private.owns_member(cooperative_id,email)
  OR public.has_partner_org_access(cooperative_id,'members.read')
  OR public.has_partner_org_access(cooperative_id,'members.manage'));
CREATE POLICY members_insert ON public.members FOR INSERT TO authenticated WITH CHECK (
  private.org_admin_access(cooperative_id) OR public.has_partner_org_access(cooperative_id,'members.manage'));
CREATE POLICY members_update ON public.members FOR UPDATE TO authenticated USING (
  private.org_admin_access(cooperative_id) OR public.has_partner_org_access(cooperative_id,'members.manage'))
  WITH CHECK (private.org_admin_access(cooperative_id) OR public.has_partner_org_access(cooperative_id,'members.manage'));
CREATE POLICY members_delete ON public.members FOR DELETE TO authenticated USING (private.org_admin_access(cooperative_id));

CREATE POLICY cards_read ON public.member_cards FOR SELECT TO authenticated USING (
  private.org_admin_access(cooperative_id)
  OR public.has_partner_org_access(cooperative_id,'cards.read')
  OR public.has_partner_org_access(cooperative_id,'cards.manage')
  OR public.has_partner_org_access(cooperative_id,'cards.print')
  OR EXISTS(SELECT 1 FROM public.members m WHERE m.id=member_id AND private.owns_member(m.cooperative_id,m.email)));
CREATE POLICY cards_insert ON public.member_cards FOR INSERT TO authenticated WITH CHECK (
  (private.org_admin_access(cooperative_id) OR public.has_partner_org_access(cooperative_id,'cards.manage'))
  AND EXISTS(SELECT 1 FROM public.members m WHERE m.id=member_id AND m.cooperative_id=member_cards.cooperative_id));
CREATE POLICY cards_update ON public.member_cards FOR UPDATE TO authenticated USING (
  private.org_admin_access(cooperative_id) OR public.has_partner_org_access(cooperative_id,'cards.manage')) WITH CHECK (
  (private.org_admin_access(cooperative_id) OR public.has_partner_org_access(cooperative_id,'cards.manage'))
  AND EXISTS(SELECT 1 FROM public.members m WHERE m.id=member_id AND m.cooperative_id=member_cards.cooperative_id));
CREATE POLICY cards_delete ON public.member_cards FOR DELETE TO authenticated USING (private.org_admin_access(cooperative_id));

CREATE POLICY payments_read ON public.payments FOR SELECT TO authenticated USING (
  private.org_admin_access(cooperative_id) OR EXISTS(SELECT 1 FROM public.members m
    WHERE m.id=member_id AND private.owns_member(m.cooperative_id,m.email)));
CREATE POLICY payments_insert ON public.payments FOR INSERT TO authenticated WITH CHECK (
  private.org_admin_access(cooperative_id) AND EXISTS(SELECT 1 FROM public.members m
    WHERE m.id=member_id AND m.cooperative_id=payments.cooperative_id));
CREATE POLICY payments_update ON public.payments FOR UPDATE TO authenticated
  USING(private.org_admin_access(cooperative_id)) WITH CHECK(private.org_admin_access(cooperative_id));

-- Existing unowned requests stay with their organisation; never guess a historical creator.
ALTER TABLE public.buyer_requests ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid();
CREATE INDEX buyer_requests_creator_idx ON public.buyer_requests(created_by);
CREATE POLICY requests_read ON public.buyer_requests FOR SELECT TO authenticated USING (
  created_by=(SELECT auth.uid()) OR private.org_admin_access(cooperative_id));
CREATE POLICY requests_insert ON public.buyer_requests FOR INSERT TO authenticated WITH CHECK (
  created_by=(SELECT auth.uid()) AND (cooperative_id IS NULL OR private.org_admin_access(cooperative_id)));
CREATE POLICY requests_update ON public.buyer_requests FOR UPDATE TO authenticated
  USING(created_by=(SELECT auth.uid()) OR private.org_admin_access(cooperative_id))
  WITH CHECK((created_by=(SELECT auth.uid()) AND (cooperative_id IS NULL OR private.org_admin_access(cooperative_id)))
    OR private.org_admin_access(cooperative_id));
CREATE POLICY requests_delete ON public.buyer_requests FOR DELETE TO authenticated
  USING(created_by=(SELECT auth.uid()) OR private.org_admin_access(cooperative_id));
CREATE POLICY matches_read ON public.buyer_matches FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.buyer_requests r WHERE r.id=request_id));
CREATE POLICY matches_update ON public.buyer_matches FOR UPDATE TO authenticated
  USING(EXISTS(SELECT 1 FROM public.buyer_requests r WHERE r.id=request_id))
  WITH CHECK(EXISTS(SELECT 1 FROM public.buyer_requests r WHERE r.id=request_id));

-- Views must not undo the table policies.
ALTER VIEW public.cooperative_stats SET (security_invoker = true);

CREATE OR REPLACE FUNCTION private.protect_request_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF current_user='authenticated' AND (NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.cooperative_id IS DISTINCT FROM OLD.cooperative_id) THEN
    RAISE EXCEPTION 'Request ownership is immutable';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.protect_request_owner() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_request_owner BEFORE UPDATE ON public.buyer_requests
  FOR EACH ROW EXECUTE FUNCTION private.protect_request_owner();

-- Explanations and question metadata can also contain answer keys.
REVOKE ALL ON public.academy_quiz_questions FROM anon,authenticated;
GRANT SELECT(id,quiz_id,question_type,prompt,points,order_index,created_at)
  ON public.academy_quiz_questions TO authenticated;
