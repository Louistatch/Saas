-- ═══════════════════════════════════════════════════════════════════════
-- SÉCURITÉ — ai_conversations : suppression de la policy FOR ALL (true)
-- Impact : n'importe qui pouvait lire/modifier/supprimer toutes les convos
-- ═══════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS ai_conv_public_rw ON public.ai_conversations;

CREATE POLICY "ai_conv_select_open"
  ON public.ai_conversations FOR SELECT
  USING (true);

GRANT INSERT ON public.ai_conversations TO anon;
CREATE POLICY "ai_conv_insert_open"
  ON public.ai_conversations FOR INSERT
  WITH CHECK (
    card_number IS NOT NULL
    AND length(card_number) BETWEEN 5 AND 50
    AND role IN ('user', 'assistant', 'system')
    AND content IS NOT NULL
    AND length(content) <= 10000
  );

-- UPDATE et DELETE : BLOQUÉS — historique immutable

-- ═══════════════════════════════════════════════════════════════════════
-- CORRECTION — market_prices : rôle 'admin' inexistant dans l'enum
-- La enum user_role n'a pas 'admin', seulement 'cooperative_admin'
-- Impact : cooperative_admin ne peut jamais mettre à jour les prix marché
-- ═══════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "market_prices_admin_update" ON public.market_prices;
DROP POLICY IF EXISTS "market_prices_update_coop_admin" ON public.market_prices;
DROP POLICY IF EXISTS "market_prices_delete_coop_admin" ON public.market_prices;

CREATE POLICY "market_prices_admin_write"
  ON public.market_prices FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('cooperative_admin', 'super_admin')
        AND p.cooperative_id = market_prices.cooperative_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('cooperative_admin', 'super_admin')
        AND p.cooperative_id = market_prices.cooperative_id
    )
  );

CREATE POLICY "market_prices_admin_delete"
  ON public.market_prices FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('cooperative_admin', 'super_admin')
        AND p.cooperative_id = market_prices.cooperative_id
    )
  );

NOTIFY pgrst, 'reload schema';
