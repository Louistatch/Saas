-- Retour arrière de 20261017_190000_haroolife_board_posts.sql : les locations de panneaux et
-- leurs signalements sont supprimés (les panneaux redeviennent libres) et le solde connu du
-- serveur revient à son calcul précédent.
DROP FUNCTION IF EXISTS public.haroolife_board_mod_act(uuid, text, text);
DROP FUNCTION IF EXISTS public.haroolife_board_mod_queue();
DROP FUNCTION IF EXISTS public.haroolife_board_report(uuid, text);
DROP FUNCTION IF EXISTS public.haroolife_board_posts_live(text);
DROP FUNCTION IF EXISTS public.haroolife_board_rent(text, integer, text, text, integer, uuid);

-- private.haroolife_known_wallet telle que dans 20261016_120000_haroolife_saves.sql (avant de
-- supprimer la table qu'elle lit).
CREATE OR REPLACE FUNCTION private.haroolife_known_wallet(p_user uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.wallet
    + coalesce((SELECT sum(t.amount) FROM public.haroolife_money_transfers t
                WHERE t.recipient_id = p_user AND t.claimed_at > s.updated_at), 0)
    - coalesce((SELECT sum(t.amount) FROM public.haroolife_money_transfers t
                WHERE t.sender_id = p_user AND t.created_at > s.updated_at), 0)
  FROM public.haroolife_saves s WHERE s.user_id = p_user
$$;
REVOKE ALL ON FUNCTION private.haroolife_known_wallet(uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS private.haroolife_board_json(public.haroolife_board_posts, uuid);
DROP FUNCTION IF EXISTS private.haroolife_board_author(uuid);
DROP FUNCTION IF EXISTS private.haroolife_board_text_problem(text);
DROP FUNCTION IF EXISTS private.haroolife_board_clean(text);
DROP FUNCTION IF EXISTS private.haroolife_board_locality(text);
DROP TABLE IF EXISTS public.haroolife_board_reports;
DROP TABLE IF EXISTS public.haroolife_board_posts;
