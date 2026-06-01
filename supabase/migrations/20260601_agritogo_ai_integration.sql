-- =============================================================================
-- 20260601_agritogo_ai_integration.sql
--
-- Intégration AgriTogo × FaîtiereHub.
--
-- 1. Table ai_conversations : historique du chat IA par carte de membre.
-- 2. Seed de prix historiques AgriTogo (12 produits × 5 marchés togolais).
--
-- DÉJÀ APPLIQUÉ en prod via le MCP Supabase le 2026-06-01.
-- Ce fichier est conservé dans le repo pour traçabilité.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_number text NOT NULL,
  role        text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     text NOT NULL,
  metadata    jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_card
  ON public.ai_conversations (card_number, created_at);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_conv_public_rw
  ON public.ai_conversations FOR ALL
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.ai_conversations IS
  'Historique des conversations IA (AgriTogo) par carte de membre.';
