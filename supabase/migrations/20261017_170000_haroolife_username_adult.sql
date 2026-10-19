-- HarooLife : réservé aux 18 ans et plus. À l'arrivée, la personne donne sa date de naissance
-- (vérifiée sur son téléphone) et coche « J'ai 18 ans ou plus » ; la date n'est jamais envoyée ni
-- stockée, seule la déclaration l'est, avec son heure (adult_confirmed_at).
--   - haroolife_take_username(nom, quartier, pagne, adulte) : comme haroolife_claim_username,
--     mais refuse sans la déclaration et la date ;
--   - haroolife_claim_username (créée par 20261017_160000, sans ce contrôle) garde sa signature
--     mais refuse désormais, pour qu'on ne puisse pas contourner la déclaration.
-- Additif : une colonne et une fonction nouvelles ; le corps d'une fonction remplacé. Aucune
-- ligne n'est supprimée ; les noms déjà pris gardent une déclaration vide jusqu'à leur prochain
-- passage.
-- Retour arrière : supabase/rollbacks/20261017_170000_haroolife_username_adult.rollback.sql

ALTER TABLE public.haroolife_usernames ADD COLUMN IF NOT EXISTS adult_confirmed_at timestamptz;

CREATE OR REPLACE FUNCTION public.haroolife_take_username(
  p_username text, p_quartier text DEFAULT 'tokoin', p_pagne integer DEFAULT 1,
  p_adult boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); wanted text := lower(trim(p_username));
        mine text; problem text; canton uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = actor) THEN
    RAISE EXCEPTION 'Compte introuvable' USING ERRCODE = '42501';
  END IF;
  IF p_adult IS NOT TRUE THEN
    RAISE EXCEPTION 'HarooLife est réservé aux personnes de 18 ans et plus' USING ERRCODE = '22023';
  END IF;
  SELECT username INTO mine FROM public.haroolife_usernames WHERE user_id = actor;
  IF mine IS DISTINCT FROM wanted THEN
    problem := private.haroolife_username_problem(wanted);
    IF problem = 'taken' THEN RAISE EXCEPTION 'Ce nom est déjà pris' USING ERRCODE = '23505'; END IF;
    IF problem IS NOT NULL THEN RAISE EXCEPTION 'Nom d''utilisateur invalide' USING ERRCODE = '22023'; END IF;
    BEGIN
      INSERT INTO public.haroolife_usernames(user_id, username, adult_confirmed_at)
        VALUES (actor, wanted, now())
      ON CONFLICT (user_id) DO UPDATE SET username = excluded.username, created_at = now();
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ce nom est déjà pris' USING ERRCODE = '23505';
    END;
  END IF;
  -- La déclaration « 18 ans ou plus » : la première heure où elle a été faite.
  UPDATE public.haroolife_usernames SET adult_confirmed_at = coalesce(adult_confirmed_at, now())
    WHERE user_id = actor;
  -- Le canton du quartier choisi ; Lomé Commune pour Tokoin, Bè et tout autre quartier.
  SELECT c.id INTO canton FROM public.cantons c
    WHERE c.name = CASE p_quartier WHEN 'agoe' THEN 'Agoè Assiyéyé' WHEN 'baguida' THEN 'Baguida'
                                    WHEN 'adidogome' THEN 'Aflao-Sagbado' ELSE 'Lome Commune' END
    ORDER BY c.id LIMIT 1;
  IF canton IS NULL THEN
    SELECT c.id INTO canton FROM public.cantons c WHERE c.name = 'Lome Commune' ORDER BY c.id LIMIT 1;
  END IF;
  IF canton IS NULL THEN SELECT c.id INTO canton FROM public.cantons c ORDER BY c.name LIMIT 1; END IF;
  IF canton IS NULL THEN RAISE EXCEPTION 'Aucun canton' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.haroolife_residents(user_id, canton_id, display_name, pagne, visible)
    VALUES (actor, canton, wanted, least(8, greatest(1, coalesce(p_pagne, 1))), true)
  ON CONFLICT (user_id) DO UPDATE SET display_name = excluded.display_name, updated_at = now();
  RETURN jsonb_build_object('username', wanted);
END $$;

-- L'ancienne entrée, sans déclaration : elle explique et refuse (même signature, mêmes droits).
CREATE OR REPLACE FUNCTION public.haroolife_claim_username(
  p_username text, p_quartier text DEFAULT 'tokoin', p_pagne integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'HarooLife est réservé aux personnes de 18 ans et plus : recharge la page pour le confirmer'
    USING ERRCODE = '22023';
END $$;

REVOKE ALL ON FUNCTION public.haroolife_take_username(text, text, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.haroolife_take_username(text, text, integer, boolean)
  TO authenticated;
