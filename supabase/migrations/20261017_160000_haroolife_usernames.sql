-- HarooLife : chaque joueur choisit un nom d'utilisateur (son personnage dans le jeu), unique.
--   - haroolife_usernames : un nom par compte, en minuscules, 3 à 20 caractères (lettres sans
--     accent, chiffres, « _ »), commençant par une lettre ; unique ; en changer libère l'ancien ;
--   - haroolife_username_available(nom) : libre ou non (lisible par tous, comme le nom affiché
--     dans la rue) ; les noms de l'équipe et du service sont réservés ;
--   - haroolife_claim_username(nom, quartier, pagne) : le joueur connecté (visiteur compris)
--     prend ce nom ; il devient son nom affiché dans le jeu et, s'il n'a pas encore de maison, sa
--     résidence est créée dans le canton du quartier choisi (Lomé). Sans maison, un visiteur ne
--     pouvait ni écrire dans les discussions ni accepter une invitation.
-- Additif : une table et trois fonctions nouvelles. Aucune ligne existante n'est modifiée, sauf le
-- nom affiché de la personne qui prend son nom d'utilisateur.
-- Retour arrière : supabase/rollbacks/20261017_160000_haroolife_usernames.rollback.sql

CREATE TABLE public.haroolife_usernames (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z][a-z0-9_]{2,19}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.haroolife_usernames ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_usernames FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haroolife_usernames TO service_role;

-- Pourquoi un nom n'est pas possible (null : il est possible).
CREATE OR REPLACE FUNCTION private.haroolife_username_problem(p_username text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN p_username IS NULL OR p_username !~ '^[a-z][a-z0-9_]{2,19}$' THEN 'format'
    WHEN p_username = ANY (ARRAY['admin', 'administrateur', 'equipe', 'moderateur', 'moderation',
                                 'support', 'visiteur', 'habitant', 'systeme', 'system', 'root',
                                 'null', 'undefined', 'anonyme'])
      OR p_username LIKE 'faitiere%' OR p_username LIKE 'haroo%' THEN 'reserved'
    WHEN EXISTS (SELECT 1 FROM public.haroolife_usernames u WHERE u.username = p_username) THEN 'taken'
  END
$$;

CREATE OR REPLACE FUNCTION public.haroolife_username_available(p_username text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'username', lower(trim(p_username)),
    'available', private.haroolife_username_problem(lower(trim(p_username))) IS NULL,
    'reason', private.haroolife_username_problem(lower(trim(p_username)))
  )
$$;

CREATE OR REPLACE FUNCTION public.haroolife_claim_username(
  p_username text, p_quartier text DEFAULT 'tokoin', p_pagne integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); wanted text := lower(trim(p_username));
        mine text; problem text; canton uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = actor) THEN
    RAISE EXCEPTION 'Compte introuvable' USING ERRCODE = '42501';
  END IF;
  SELECT username INTO mine FROM public.haroolife_usernames WHERE user_id = actor;
  IF mine IS DISTINCT FROM wanted THEN
    problem := private.haroolife_username_problem(wanted);
    IF problem = 'taken' THEN RAISE EXCEPTION 'Ce nom est déjà pris' USING ERRCODE = '23505'; END IF;
    IF problem IS NOT NULL THEN RAISE EXCEPTION 'Nom d''utilisateur invalide' USING ERRCODE = '22023'; END IF;
    BEGIN
      INSERT INTO public.haroolife_usernames(user_id, username) VALUES (actor, wanted)
      ON CONFLICT (user_id) DO UPDATE SET username = excluded.username, created_at = now();
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ce nom est déjà pris' USING ERRCODE = '23505';
    END;
  END IF;
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

-- Mon nom d'utilisateur (null tant que je n'en ai pas choisi).
CREATE OR REPLACE FUNCTION public.haroolife_my_username()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT username FROM public.haroolife_usernames WHERE user_id = (SELECT auth.uid())
$$;

REVOKE ALL ON FUNCTION private.haroolife_username_problem(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.haroolife_username_available(text),
  public.haroolife_claim_username(text, text, integer), public.haroolife_my_username()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.haroolife_username_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.haroolife_claim_username(text, text, integer),
  public.haroolife_my_username() TO authenticated;
