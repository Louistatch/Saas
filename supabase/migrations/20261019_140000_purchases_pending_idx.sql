-- Index partiels pour les achats en attente.
--
-- NON APPLIQUÉE automatiquement ; purement additive (le code fonctionne sans).
--   - purchases_pending_created_idx : rapprochement quotidien
--     (/api/cron/purchases-reconcile), qui parcourt les achats « pending » par
--     date de création ;
--   - purchases_pending_fiche_phone_idx : refus d'une nouvelle demande de
--     paiement quand un paiement est déjà en cours pour la même fiche et le
--     même numéro (POST /api/fiches/[id]/purchase).
--
-- Renommée (ex-20261018_140000) pour passer après les migrations de main. Idempotente.

create index if not exists purchases_pending_created_idx
  on public.purchases (created_at)
  where payment_status = 'pending';

create index if not exists purchases_pending_fiche_phone_idx
  on public.purchases (fiche_id, buyer_phone)
  where payment_status = 'pending';
