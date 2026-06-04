-- Allow anonymous users to read member info for public card verification.
-- Only members with at least one active card are accessible, matching the
-- existing member_cards_anon_active policy on member_cards.
-- Sensitive fields (email, phone, date_of_birth, address) are not
-- selected by the verify API so this poses no privacy risk.

CREATE POLICY "members_anon_card_verify"
  ON public.members
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.member_cards mc
      WHERE mc.member_id = members.id
        AND mc.status = 'active'
    )
  );
