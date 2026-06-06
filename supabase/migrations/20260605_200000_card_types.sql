-- =============================================================================
-- 20260605_200000_card_types.sql
-- Add card_type to member_cards.
-- Profile data for OUVRIER/ACHETEUR/AGRONOME lives in AgriTogo (Django).
-- FaîtiereHub only stores FAITIERE cards in Supabase.
-- =============================================================================

ALTER TABLE public.member_cards
  ADD COLUMN IF NOT EXISTS card_type TEXT NOT NULL DEFAULT 'FAITIERE'
  CHECK (card_type IN ('FAITIERE','OUVRIER','ACHETEUR','AGRONOME'));

CREATE INDEX IF NOT EXISTS idx_member_cards_type ON public.member_cards(card_type);

COMMENT ON COLUMN public.member_cards.card_type IS
  'FAITIERE = cooperative member (Supabase). Other types verified via AgriTogo API.';
