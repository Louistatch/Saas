-- Retour arrière de 20261016_150000_visitors_outside_faitierehub.sql : retire les politiques
-- « pas de visiteur HarooLife » (les visiteurs lisent alors ce que lit tout compte connecté).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
           WHERE schemaname = 'public' AND policyname LIKE 'pas de visiteur HarooLife%' LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;
