-- HarooLife : ménage des visiteurs inactifs. Un visiteur (compte anonyme Supabase, sans e-mail)
-- qui n'a plus ouvert le jeu depuis 30 jours ne peut plus retrouver sa partie (sans e-mail, pas
-- de reconnexion) : son compte est supprimé, avec ce qui en dépend (profil, maison, sauvegarde,
-- messages). Supabase recommande ce ménage (pas de nettoyage automatique des comptes anonymes).
--   - n'est concerné qu'un compte anonyme, créé il y a plus de p_days jours, sans session
--     rafraîchie, connexion ni sauvegarde depuis p_days jours ;
--   - jamais un visiteur qui a envoyé ou reçu de l'argent du jeu (les soldes des autres joueurs
--     en dépendent) ;
--   - un compte qu'une autre table retient (clé étrangère sans cascade) est laissé tel quel ;
--   - au plus p_limit comptes par passage. Appelée chaque jour par /api/cron/haroolife-visitors.
-- Exécutable par le service seulement. Aucun compte FaîtiereHub (non anonyme) n'est touché.
-- Retour arrière : supabase/rollbacks/20261017_120000_haroolife_visitor_purge.rollback.sql

CREATE OR REPLACE FUNCTION public.haroolife_purge_visitors(p_days integer DEFAULT 30, p_limit integer DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  cutoff timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 30), 7));
  u uuid; purged integer := 0; kept integer := 0;
BEGIN
  FOR u IN
    SELECT au.id FROM auth.users au
    WHERE au.is_anonymous IS TRUE
      AND au.created_at < cutoff
      AND coalesce(au.last_sign_in_at, au.created_at) < cutoff
      AND coalesce(au.updated_at, au.created_at) < cutoff
      AND NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id = au.id
                      AND greatest(s.updated_at, s.refreshed_at::timestamptz, s.created_at) >= cutoff)
      AND NOT EXISTS (SELECT 1 FROM public.haroolife_saves sv WHERE sv.user_id = au.id AND sv.updated_at >= cutoff)
      AND NOT EXISTS (SELECT 1 FROM public.haroolife_money_transfers t
                      WHERE t.sender_id = au.id OR t.recipient_id = au.id)
    ORDER BY au.created_at
    LIMIT greatest(1, least(coalesce(p_limit, 500), 5000))
  LOOP
    BEGIN
      DELETE FROM auth.users WHERE id = u AND is_anonymous IS TRUE;
      purged := purged + 1;
    EXCEPTION WHEN foreign_key_violation THEN
      kept := kept + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('purged', purged, 'kept', kept, 'cutoff', cutoff);
END $$;

REVOKE ALL ON FUNCTION public.haroolife_purge_visitors(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.haroolife_purge_visitors(integer, integer) TO service_role;
