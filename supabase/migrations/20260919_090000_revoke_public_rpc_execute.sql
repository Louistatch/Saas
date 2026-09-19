-- ─────────────────────────────────────────────────────────────────────────────
-- Refermer l'exécution publique des fonctions SECURITY DEFINER
--
-- Les advisors Supabase signalaient 18 fonctions SECURITY DEFINER appelables
-- par le rôle `anon` via /rest/v1/rpc/<nom>. Deux d'entre elles suppriment des
-- données :
--     purge_old_ai_conversations()
--     purge_old_weather_data()
-- N'importe qui sur Internet pouvait donc vider ces tables. D'autres mutent le
-- scoring des membres ou rejouent des soumissions KoboCollect.
--
-- Cause : PostgreSQL accorde EXECUTE à PUBLIC par défaut sur toute fonction
-- créée, et PostgREST expose tout ce que PUBLIC peut exécuter.
--
-- Méthode : on retire tout, puis on rouvre explicitement, fonction par
-- fonction, d'après l'usage réel constaté dans le code :
--   • appelée depuis le navigateur ou une route en contexte utilisateur
--     → `authenticated`
--   • appelée depuis une page publique sans session → `anon` + `authenticated`
--   • déclencheur, maintenance, ou appelée uniquement via le client
--     service_role → personne (service_role ignore ces droits)
--
-- Les fonctions de déclencheur ne perdent rien : PostgreSQL vérifie EXECUTE à
-- la création du trigger, pas à chaque déclenchement.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Tout fermer ──────────────────────────────────────────────────────────
DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    'public.calculate_member_ats(uuid)',
    'public.current_haroo_type()',
    'public.fill_card_qr_data()',
    'public.get_accessible_cooperative_ids()',
    'public.get_cooperative_descendants(uuid)',
    'public.get_dashboard_stats(uuid)',
    'public.get_kobo_stats(uuid)',
    'public.get_member_score(uuid)',
    'public.get_platform_totals()',
    'public.handle_new_user()',
    'public.has_org_access(uuid, public.user_role[])',
    'public.increment_download_count(uuid)',
    'public.match_kobo_submission_to_member(uuid)',
    'public.process_kobo_submission(uuid)',
    'public.purge_old_ai_conversations()',
    'public.purge_old_weather_data()',
    'public.trigger_recalc_ats_on_cotisation()',
    'public.upsert_member_ats(uuid)',
    'public.verify_card(text[])'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
  END LOOP;
END$$;

REVOKE ALL ON FUNCTION public.search_marketplace(
  text, text, text, uuid, uuid, uuid, uuid, boolean, numeric, numeric,
  text, text, text, text, text, integer, integer
) FROM PUBLIC, anon, authenticated;

-- ── 2. Rouvrir aux comptes connectés, d'après l'usage constaté ──────────────
-- get_accessible_cooperative_ids : contexts client (cooperative-context.tsx,
-- dashboard/parcelles) ET expression de policy sur embed_configs et templates.
GRANT EXECUTE ON FUNCTION public.get_accessible_cooperative_ids() TO authenticated;
-- Lectures de tableau de bord et de scoring, toutes en contexte utilisateur.
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kobo_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_totals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_member_ats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_member_ats(uuid) TO authenticated;
-- Synchronisation KoboCollect : lib/kobo/sync-service.ts passe par le client
-- serveur, donc en contexte utilisateur. Le webhook, lui, est en service_role.
GRANT EXECUTE ON FUNCTION public.match_kobo_submission_to_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_kobo_submission(uuid) TO authenticated;
-- Aides du compte à deux couches, destinées aux expressions de policy.
GRANT EXECUTE ON FUNCTION public.has_org_access(uuid, public.user_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_haroo_type() TO authenticated;

-- ── 3. Rouvrir au public, là où le parcours est réellement anonyme ──────────
-- La marketplace est une page publique (MarketingLayout) : un visiteur non
-- connecté doit pouvoir chercher.
GRANT EXECUTE ON FUNCTION public.search_marketplace(
  text, text, text, uuid, uuid, uuid, uuid, boolean, numeric, numeric,
  text, text, text, text, text, integer, integer
) TO anon, authenticated;
-- /api/fiches/[id]/access n'impose aucune session : l'accès à une fiche se fait
-- sur présentation d'un numéro de carte. Le compteur doit suivre.
GRANT EXECUTE ON FUNCTION public.increment_download_count(uuid) TO anon, authenticated;

-- ── 4. Restent fermées à tous ───────────────────────────────────────────────
-- purge_old_ai_conversations, purge_old_weather_data : maintenance destructive
-- handle_new_user, fill_card_qr_data, trigger_recalc_ats_on_cotisation : déclencheurs
-- get_cooperative_descendants : appelée uniquement via le client service_role
-- verify_card : aucune référence dans le code applicatif
COMMENT ON FUNCTION public.purge_old_weather_data IS
  'Maintenance. Aucun EXECUTE pour anon/authenticated : à appeler en service_role.';
COMMENT ON FUNCTION public.purge_old_ai_conversations IS
  'Maintenance. Aucun EXECUTE pour anon/authenticated : à appeler en service_role.';
COMMENT ON FUNCTION public.verify_card IS
  'Sans appelant dans le code applicatif. EXECUTE retiré ; supprimer si confirmé inutile.';
