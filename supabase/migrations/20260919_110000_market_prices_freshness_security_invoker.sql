-- ─────────────────────────────────────────────────────────────────────────────
-- market_prices_freshness : passer en SECURITY INVOKER
--
-- Une vue créée sans option s'exécute avec les droits de son propriétaire
-- (postgres), donc en contournant le RLS de market_prices. Ici la table est
-- lisible par tous (policy SELECT `qual: true` pour public), donc rien ne
-- fuitait — mais la vue restait une porte dérobée si la policy se resserrait
-- un jour. On aligne la vue sur l'appelant maintenant, pendant que le
-- changement n'a aucun effet observable.
--
-- Vérifié avant bascule : aucun appelant dans le dépôt (app, lib, components,
-- hooks) ni dans AgriTogo. La vue est un outil d'inspection.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER VIEW public.market_prices_freshness SET (security_invoker = true);

COMMENT ON VIEW public.market_prices_freshness IS
  'Fraîcheur des prix du marché. SECURITY INVOKER : lit market_prices sous le RLS de l''appelant. Aucun appelant applicatif à ce jour — vue d''inspection.';
