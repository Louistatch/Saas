-- Performance indexes for high-frequency dashboard queries

-- Listings filter by status + cooperative (agrimarket dashboard)
CREATE INDEX IF NOT EXISTS idx_market_listings_status_coop
  ON public.market_listings (cooperative_id, status)
  WHERE status = 'active';

-- Cotisations filter by member + status (payment history, ATS trigger)
CREATE INDEX IF NOT EXISTS idx_cotisations_member_status
  ON public.cotisations (member_id, status);

-- Cotisations filter by cooperative + status (dashboard stats)
CREATE INDEX IF NOT EXISTS idx_cotisations_coop_status
  ON public.cotisations (cooperative_id, status);

-- Members by cooperative (card generation, member lists)
CREATE INDEX IF NOT EXISTS idx_members_coop_id
  ON public.members (cooperative_id);

-- Notifications inbox (bell + page — ordered by created_at)
CREATE INDEX IF NOT EXISTS idx_notifications_inapp_coop_created
  ON public.notifications_inapp (cooperative_id, created_at DESC);

-- Notifications unread filter
CREATE INDEX IF NOT EXISTS idx_notifications_inapp_coop_unread
  ON public.notifications_inapp (cooperative_id, read_at)
  WHERE read_at IS NULL;

-- Member cards by cooperative + status (print page, card list)
CREATE INDEX IF NOT EXISTS idx_member_cards_coop_status
  ON public.member_cards (cooperative_id, status)
  WHERE status = 'active';

-- ATS scores lookup by member
CREATE INDEX IF NOT EXISTS idx_member_ats_scores_calculated
  ON public.member_ats_scores (member_id, calculated_at DESC);
