-- =============================================================================
-- Fix: member_cards RLS policies missing WITH CHECK clauses
--
-- Bug: Existing policies on member_cards have polcmd='*' (FOR ALL) but
-- check_expr=NULL. PostgreSQL requires WITH CHECK for INSERTs to be allowed
-- under a FOR ALL policy when permissive checks differ from USING.
--
-- Symptom: silent INSERT failures from /dashboard/cards (no card persisted,
-- though the toast shows "Carte générée" because supabase-js doesn't
-- always surface RLS-induced 0-row inserts as errors when using insert
-- without .select()).
--
-- Fix: Drop the FOR ALL policies and recreate them as separate
-- SELECT/INSERT/UPDATE/DELETE policies, each with explicit USING and/or
-- WITH CHECK clauses.
--
-- Apply via Supabase SQL Editor.
-- =============================================================================

-- Drop the existing problematic policies
DROP POLICY IF EXISTS "Coop admins can manage cards"        ON public.member_cards;
DROP POLICY IF EXISTS "Coop members can view their coop cards" ON public.member_cards;
DROP POLICY IF EXISTS "Super admins manage all cards"       ON public.member_cards;

-- =============================================================================
-- SELECT: cooperative members see cards from their coop
-- =============================================================================
CREATE POLICY "member_cards_select_coop"
  ON public.member_cards
  FOR SELECT
  USING (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p
      WHERE p.id = auth.uid()
    )
  );

-- =============================================================================
-- SELECT: super admins see all cards
-- =============================================================================
CREATE POLICY "member_cards_select_super_admin"
  ON public.member_cards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- =============================================================================
-- INSERT: coop admins create cards for their cooperative
-- =============================================================================
CREATE POLICY "member_cards_insert_coop_admin"
  ON public.member_cards
  FOR INSERT
  WITH CHECK (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('cooperative_admin', 'super_admin')
    )
  );

-- =============================================================================
-- INSERT: super admins create cards for any cooperative
-- =============================================================================
CREATE POLICY "member_cards_insert_super_admin"
  ON public.member_cards
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- =============================================================================
-- UPDATE: coop admins update cards from their cooperative
-- =============================================================================
CREATE POLICY "member_cards_update_coop_admin"
  ON public.member_cards
  FOR UPDATE
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

-- =============================================================================
-- UPDATE: super admins update any card
-- =============================================================================
CREATE POLICY "member_cards_update_super_admin"
  ON public.member_cards
  FOR UPDATE
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

-- =============================================================================
-- DELETE: coop admins delete cards from their cooperative
-- =============================================================================
CREATE POLICY "member_cards_delete_coop_admin"
  ON public.member_cards
  FOR DELETE
  USING (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('cooperative_admin', 'super_admin')
    )
  );

-- =============================================================================
-- DELETE: super admins delete any card
-- =============================================================================
CREATE POLICY "member_cards_delete_super_admin"
  ON public.member_cards
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

-- =============================================================================
-- Public anon access for /verify (RLS still applies but anon needs SELECT)
-- =============================================================================
GRANT SELECT ON public.member_cards TO anon;

CREATE POLICY "member_cards_anon_select_active"
  ON public.member_cards
  FOR SELECT
  TO anon
  USING (status = 'active');
