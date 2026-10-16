-- Le visiteur HarooLife n'est pas un compte FaîtiereHub. Un visiteur (compte anonyme Supabase,
-- jeton is_anonymous) ouvre le jeu seulement ; côté application il est traité comme non connecté
-- (middleware, AuthContext, getAccessContext). Ici, la même règle au niveau des données, pour les
-- tables qu'un compte connecté quelconque pouvait lire ou écrire sans appartenir à une
-- organisation :
--   - lecture ouverte à tout compte connecté (Académie, annonces et prévisions du marché,
--     réglages des coopératives, règles de facturation, modèles de notification) ;
--   - écriture de ses propres lignes (documents professionnels, budgets d'entreprise, prix du
--     marché, profils et cantons Haroo).
-- Chaque table reçoit une politique RESTRICTIVE « pas de visiteur HarooLife » : elle ne change
-- rien pour un compte FaîtiereHub (la condition est vraie), et refuse le visiteur. Les tables
-- lisibles par tous (anon compris), profiles (le visiteur lit son propre profil) et le jeu
-- (haroolife_*, fonctions SECURITY DEFINER) ne sont pas concernés.
-- Additif : aucune politique existante n'est modifiée, aucune ligne n'est touchée.
-- Retour arrière : supabase/rollbacks/20261016_150000_visitors_outside_faitierehub.rollback.sql

DO $$
DECLARE
  t text;
  not_visitor constant text :=
    '(SELECT coalesce((auth.jwt() ->> ''is_anonymous'')::boolean, false)) IS FALSE';
BEGIN
  -- Lecture et écriture réservées aux comptes FaîtiereHub.
  FOREACH t IN ARRAY ARRAY[
    'academy_assignments', 'academy_lesson_slides', 'academy_lessons', 'academy_media_assets',
    'academy_quiz_options', 'academy_quiz_questions', 'academy_quizzes', 'billing_rules',
    'cooperative_settings', 'market_listings', 'market_price_forecasts', 'notification_templates',
    'enterprise_budget_snapshots', 'professional_documents', 'haroo_ouvrier_cantons',
    'haroo_ouvrier_profiles', 'haroo_acheteur_profiles', 'haroo_agronome_profiles'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pas de visiteur HarooLife', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      'pas de visiteur HarooLife', t, not_visitor, not_visitor);
  END LOOP;
  -- Lisibles par tous (anon compris) : seule l'écriture est réservée.
  FOREACH t IN ARRAY ARRAY['market_prices'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pas de visiteur HarooLife (ajout)', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pas de visiteur HarooLife (modif)', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pas de visiteur HarooLife (suppr)', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)',
      'pas de visiteur HarooLife (ajout)', t, not_visitor);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      'pas de visiteur HarooLife (modif)', t, not_visitor, not_visitor);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)',
      'pas de visiteur HarooLife (suppr)', t, not_visitor);
  END LOOP;
END $$;
