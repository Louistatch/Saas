-- Related private records must not re-open cross-organisation access.
DO $$ DECLARE p record; t text; BEGIN
  FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('cotisations','parcelles','intrants','productions','member_access_logs','producer_announcements')
  LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
  FOREACH t IN ARRAY ARRAY['cotisations','parcelles','intrants','productions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format('CREATE POLICY scoped_read ON public.%I FOR SELECT TO authenticated USING (
      private.org_admin_access(cooperative_id) OR EXISTS(SELECT 1 FROM public.members m
        WHERE m.id=member_id AND private.owns_member(m.cooperative_id,m.email)))',t);
    EXECUTE format('CREATE POLICY scoped_write ON public.%I FOR ALL TO authenticated
      USING(private.org_admin_access(cooperative_id)) WITH CHECK(private.org_admin_access(cooperative_id)
        AND (member_id IS NULL OR EXISTS(SELECT 1 FROM public.members m
          WHERE m.id=member_id AND m.cooperative_id=%I.cooperative_id)))',t,t);
  END LOOP;
END $$;
REVOKE ALL ON public.member_access_logs FROM anon,authenticated;
GRANT SELECT ON public.member_access_logs TO authenticated;
CREATE POLICY logs_read ON public.member_access_logs FOR SELECT TO authenticated USING (
  private.org_admin_access(cooperative_id) OR EXISTS(SELECT 1 FROM public.members m
    WHERE m.id=member_id AND private.owns_member(m.cooperative_id,m.email)));
REVOKE ALL ON public.producer_announcements FROM anon,authenticated;
GRANT SELECT ON public.producer_announcements TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.producer_announcements TO authenticated;
CREATE POLICY announcements_public ON public.producer_announcements FOR SELECT TO anon,authenticated USING(status='active');
CREATE POLICY announcements_owner ON public.producer_announcements FOR ALL TO authenticated USING (
  private.org_admin_access(cooperative_id) OR EXISTS(SELECT 1 FROM public.members m
    WHERE m.id=member_id AND private.owns_member(m.cooperative_id,m.email))) WITH CHECK (
  EXISTS(SELECT 1 FROM public.members m WHERE m.id=member_id AND m.cooperative_id=producer_announcements.cooperative_id
    AND (private.org_admin_access(m.cooperative_id) OR private.owns_member(m.cooperative_id,m.email))));
-- Scores now use the caller's table policies rather than bypassing them.
ALTER FUNCTION public.calculate_member_ats(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_member_score(uuid) SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.calculate_member_ats(uuid),public.get_member_score(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.calculate_member_ats(uuid),public.get_member_score(uuid) TO authenticated,service_role;
CREATE INDEX IF NOT EXISTS buyer_requests_cooperative_idx ON public.buyer_requests(cooperative_id);
CREATE INDEX IF NOT EXISTS payments_cotisation_idx ON public.payments(cotisation_id);
