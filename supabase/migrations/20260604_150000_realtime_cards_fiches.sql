-- Enable Supabase Realtime on member_cards and fiches_techniques
-- so dashboards auto-refresh when Kobo webhooks insert new data
ALTER PUBLICATION supabase_realtime ADD TABLE public.member_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fiches_techniques;
