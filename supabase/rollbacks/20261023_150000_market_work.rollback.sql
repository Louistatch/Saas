-- Retour arrière de 20261023_150000_market_work.sql.
-- ⚠️ Supprime les réponses et invitations du marché, et les colonnes d'offre de travail
-- (salaire, postes, début, durée) des annonces. À n'exécuter qu'en connaissance de cause.
-- Si 20261023_150100_market_anon_phone.sql est appliquée, exécuter d'abord son retour arrière.

DROP FUNCTION IF EXISTS public.market_respond(uuid, text, numeric, text);
DROP FUNCTION IF EXISTS public.market_invite(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.market_decide(uuid, boolean);
DROP FUNCTION IF EXISTS public.market_withdraw(uuid);
DROP FUNCTION IF EXISTS public.market_close(uuid);
DROP FUNCTION IF EXISTS public.market_activity();
DROP FUNCTION IF EXISTS public.market_unread();
DROP FUNCTION IF EXISTS public.market_seen();
DROP FUNCTION IF EXISTS public.market_workers(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS private.market_unread(uuid);
DROP FUNCTION IF EXISTS private.market_for_responder(public.market_responses);
DROP FUNCTION IF EXISTS private.market_for_author(public.market_responses);
DROP FUNCTION IF EXISTS private.market_announcement_json(public.producer_announcements);
DROP FUNCTION IF EXISTS private.market_open(public.producer_announcements);
DROP FUNCTION IF EXISTS private.market_person(uuid);
DROP FUNCTION IF EXISTS private.market_own_phone(uuid);
DROP FUNCTION IF EXISTS private.market_phone_shown(text);
DROP FUNCTION IF EXISTS private.market_phone(text);

DROP TABLE IF EXISTS public.market_responses;

DROP INDEX IF EXISTS public.producer_announcements_open_recent;
ALTER TABLE public.producer_announcements ALTER COLUMN expires_at DROP DEFAULT;
ALTER TABLE public.producer_announcements
  DROP COLUMN IF EXISTS accepts_responses,
  DROP COLUMN IF EXISTS has_contact,
  DROP COLUMN IF EXISTS work_days,
  DROP COLUMN IF EXISTS starts_on,
  DROP COLUMN IF EXISTS positions,
  DROP COLUMN IF EXISTS wage_per_day_fcfa;
