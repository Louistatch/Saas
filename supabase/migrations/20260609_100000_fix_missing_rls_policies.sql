-- ═══════════════════════════════════════════════════════════════════════
-- CORRECTION CRITIQUE — 5 tables avec RLS activé mais zéro policy
-- Impact : modules dashboard complètement bloqués pour tous les users
-- Tables : parcelles, productions, contact_requests, purchases,
--          member_access_logs
-- ═══════════════════════════════════════════════════════════════════════

-- ── parcelles ────────────────────────────────────────────────────────
CREATE POLICY "parcelles_own_coop_select"
  ON public.parcelles FOR SELECT TO authenticated
  USING (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "parcelles_admin_all"
  ON public.parcelles FOR ALL TO authenticated
  USING (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('cooperative_admin', 'super_admin')
    )
  )
  WITH CHECK (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('cooperative_admin', 'super_admin')
    )
  );

CREATE POLICY "parcelles_super_admin_all"
  ON public.parcelles FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ── productions ──────────────────────────────────────────────────────
CREATE POLICY "productions_own_coop_select"
  ON public.productions FOR SELECT TO authenticated
  USING (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "productions_admin_all"
  ON public.productions FOR ALL TO authenticated
  USING (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('cooperative_admin', 'super_admin')
    )
  )
  WITH CHECK (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('cooperative_admin', 'super_admin')
    )
  );

CREATE POLICY "productions_super_admin_all"
  ON public.productions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ── contact_requests ─────────────────────────────────────────────────
GRANT INSERT ON public.contact_requests TO anon;
CREATE POLICY "contact_requests_public_insert"
  ON public.contact_requests FOR INSERT
  WITH CHECK (
    name IS NOT NULL AND length(name) >= 2
    AND message IS NOT NULL AND length(message) >= 10
  );

CREATE POLICY "contact_requests_admin_all"
  ON public.contact_requests FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- ── purchases ────────────────────────────────────────────────────────
GRANT INSERT, SELECT ON public.purchases TO anon;
GRANT ALL ON public.purchases TO authenticated;

CREATE POLICY "purchases_public_insert"
  ON public.purchases FOR INSERT
  WITH CHECK (true);

CREATE POLICY "purchases_own_read"
  ON public.purchases FOR SELECT TO authenticated
  USING (
    buyer_email IN (
      SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "purchases_admin_all"
  ON public.purchases FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('cooperative_admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('cooperative_admin', 'super_admin')
    )
  );

-- ── member_access_logs ───────────────────────────────────────────────
CREATE POLICY "access_logs_coop_admin_select"
  ON public.member_access_logs FOR SELECT TO authenticated
  USING (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('cooperative_admin', 'super_admin')
    )
  );

CREATE POLICY "access_logs_super_admin_all"
  ON public.member_access_logs FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

NOTIFY pgrst, 'reload schema';
