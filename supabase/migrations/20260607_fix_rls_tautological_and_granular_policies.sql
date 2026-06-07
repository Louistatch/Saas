-- ─────────────────────────────────────────────────────────────
-- FIX 1: payments — policy tautologique remplacée
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "payments own coop" ON payments;

CREATE POLICY "payments_own_coop_read" ON payments
  FOR SELECT USING (
    cooperative_id IN (
      SELECT profiles.cooperative_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "payments_admin_write" ON payments
  FOR ALL USING (
    auth.uid() IN (
      SELECT profiles.id FROM profiles
      WHERE profiles.role = ANY (ARRAY['super_admin'::user_role, 'cooperative_admin'::user_role])
    )
  );

-- ─────────────────────────────────────────────────────────────
-- FIX 2: member_ats_scores — policy tautologique remplacée
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cooperative members can read own ats" ON member_ats_scores;

CREATE POLICY "ats_scores_own_coop_read" ON member_ats_scores
  FOR SELECT USING (
    cooperative_id IN (
      SELECT profiles.cooperative_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "ats_scores_anon_card_verify" ON member_ats_scores
  FOR SELECT USING (
    member_id IN (
      SELECT member_cards.member_id FROM member_cards WHERE member_cards.status = 'active'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- FIX 3: journal_entries — granulaire admin vs lecture
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "journal own coop" ON journal_entries;
DROP POLICY IF EXISTS "journal_entries_own_coop" ON journal_entries;

CREATE POLICY "journal_admin_full" ON journal_entries
  FOR ALL USING (
    auth.uid() IN (
      SELECT profiles.id FROM profiles
      WHERE profiles.role = ANY (ARRAY['super_admin'::user_role, 'cooperative_admin'::user_role])
      AND profiles.cooperative_id = journal_entries.cooperative_id
    )
  );

CREATE POLICY "journal_own_coop_read" ON journal_entries
  FOR SELECT USING (
    cooperative_id IN (
      SELECT profiles.cooperative_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- FIX 4: intrants — granulaire admin vs lecture
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "intrants own coop" ON intrants;
DROP POLICY IF EXISTS "intrants_own_coop" ON intrants;

CREATE POLICY "intrants_admin_full" ON intrants
  FOR ALL USING (
    auth.uid() IN (
      SELECT profiles.id FROM profiles
      WHERE profiles.role = ANY (ARRAY['super_admin'::user_role, 'cooperative_admin'::user_role])
      AND profiles.cooperative_id = intrants.cooperative_id
    )
  );

CREATE POLICY "intrants_own_coop_read" ON intrants
  FOR SELECT USING (
    cooperative_id IN (
      SELECT profiles.cooperative_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- FIX 5: campagnes — granulaire admin vs lecture
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "campagnes own coop" ON campagnes;
DROP POLICY IF EXISTS "campagnes_own_coop" ON campagnes;

CREATE POLICY "campagnes_admin_full" ON campagnes
  FOR ALL USING (
    auth.uid() IN (
      SELECT profiles.id FROM profiles
      WHERE profiles.role = ANY (ARRAY['super_admin'::user_role, 'cooperative_admin'::user_role])
      AND profiles.cooperative_id = campagnes.cooperative_id
    )
  );

CREATE POLICY "campagnes_own_coop_read" ON campagnes
  FOR SELECT USING (
    cooperative_id IN (
      SELECT profiles.cooperative_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );
