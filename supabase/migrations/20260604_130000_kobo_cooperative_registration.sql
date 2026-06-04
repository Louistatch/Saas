-- Enable Supabase Realtime on cooperatives and members tables.
-- Cooperatives: allows dashboard to receive new coops from KoboCollect webhook in real time.
-- Members: allows cards page to detect new members enrolled from the field.

ALTER PUBLICATION supabase_realtime ADD TABLE public.cooperatives;
ALTER PUBLICATION supabase_realtime ADD TABLE public.members;
