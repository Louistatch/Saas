-- HarooLife : qui est dans le jeu. Jusqu'ici, le jeu ne montrait que les joueurs connectés au
-- relais dans la même ville (présence par ville) ; on ne pouvait écrire qu'à un joueur croisé.
--   - haroolife_last_seen : le dernier signe de vie de chaque partie ouverte (un battement par
--     minute tant que le jeu est affiché, visiteurs compris), et la ville où le joueur se trouve ;
--   - haroolife_here(ville) : le battement ; rend le nombre de personnes en ligne dans tout le
--     jeu (signe de vie depuis moins de 2 minutes) et le nombre d'habitants ;
--   - haroolife_players(recherche, nombre) : les habitants visibles (ceux qui ont choisi une
--     maison et ne se sont pas rendus invisibles), en ligne d'abord, puis du plus récent au plus
--     ancien, avec leur clé d'auteur opaque. Avec cette clé, haroolife_dm_open ouvre une
--     conversation privée même si la personne n'est pas connectée : elle la lit à son retour,
--     dans le jeu ou sur son tableau de bord (haroolife_dm_inbox).
-- Règle de consentement élargie à la demande du fondateur : un habitant peut écrire à tout
-- habitant visible, plus seulement à ceux qu'il a croisés. Les garde-fous restent ceux de
-- haroolife_dm_open : 20 nouvelles conversations par jour, blocage dans les deux sens (un joueur
-- bloqué disparaît de la liste), signalement. L'heure exacte du dernier passage n'est jamais
-- rendue : seulement « en ligne », « aujourd'hui », « cette semaine » ou rien.
-- Dépend de 20261013_120000 (clé d'auteur), 20261015_130000 (blocages), 20261016_120000
-- (sauvegardes), 20261017_160000 (noms d'utilisateur).
-- Additif : une table et trois fonctions nouvelles. Aucune ligne existante n'est touchée.
-- Retour arrière : supabase/rollbacks/20261022_130000_haroolife_players.rollback.sql

CREATE TABLE public.haroolife_last_seen (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  locality text NOT NULL CHECK (locality ~ '^[a-z]{2,12}$')
);
CREATE INDEX haroolife_last_seen_recent ON public.haroolife_last_seen(seen_at DESC);
ALTER TABLE public.haroolife_last_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_last_seen FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haroolife_last_seen TO service_role;

-- En ligne : un signe de vie depuis moins de 2 minutes (battement ou sauvegarde de la partie).
CREATE OR REPLACE FUNCTION private.haroolife_online_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::integer FROM (
    SELECT user_id FROM public.haroolife_last_seen WHERE seen_at > now() - interval '2 minutes'
    UNION
    SELECT user_id FROM public.haroolife_saves WHERE updated_at > now() - interval '2 minutes'
  ) x
$$;

CREATE OR REPLACE FUNCTION private.haroolife_resident_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::integer FROM public.haroolife_residents h
  JOIN public.profiles p ON p.id = h.user_id AND p.deleted_at IS NULL
$$;

-- Le battement du jeu ouvert. Une écriture au plus toutes les 20 secondes par joueur.
CREATE OR REPLACE FUNCTION public.haroolife_here(p_locality text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid());
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF coalesce(p_locality, '') !~ '^[a-z]{2,12}$' THEN
    RAISE EXCEPTION 'Ville inconnue' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.haroolife_last_seen(user_id, seen_at, locality)
  VALUES (actor, now(), p_locality)
  ON CONFLICT (user_id) DO UPDATE SET seen_at = now(), locality = EXCLUDED.locality
    WHERE public.haroolife_last_seen.seen_at < now() - interval '20 seconds'
       OR public.haroolife_last_seen.locality <> EXCLUDED.locality;
  RETURN jsonb_build_object('online', private.haroolife_online_count(),
                            'players', private.haroolife_resident_count());
END $$;

-- Les habitants visibles. p_search cherche dans le nom affiché et le nom d'utilisateur.
CREATE OR REPLACE FUNCTION public.haroolife_players(p_search text DEFAULT NULL, p_limit integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); out jsonb;
        v_search text := nullif(left(trim(coalesce(p_search, '')), 40), '');
        v_like text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  v_like := '%' || replace(replace(replace(lower(ltrim(coalesce(v_search, ''), '@')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'key', private.haroolife_author_key(x.user_id),
    'name', x.display_name,
    'username', x.username,
    'pagne', x.pagne,
    'online', x.online,
    'locality', CASE WHEN x.online THEN x.locality END,
    'seen', CASE WHEN x.online THEN 'now'
                 WHEN x.seen > now() - interval '24 hours' THEN 'today'
                 WHEN x.seen > now() - interval '7 days' THEN 'week' END
  ) ORDER BY x.online DESC, x.seen DESC NULLS LAST, x.created_at DESC), '[]'::jsonb)
  INTO out
  FROM (
    SELECT h.user_id, h.display_name, h.pagne, h.created_at, u.username, ls.locality,
           greatest(ls.seen_at, sv.updated_at) AS seen,
           coalesce(greatest(ls.seen_at, sv.updated_at) > now() - interval '2 minutes', false) AS online
    FROM public.haroolife_residents h
    JOIN public.profiles p ON p.id = h.user_id AND p.deleted_at IS NULL
    LEFT JOIN public.haroolife_usernames u ON u.user_id = h.user_id
    LEFT JOIN public.haroolife_last_seen ls ON ls.user_id = h.user_id
    LEFT JOIN public.haroolife_saves sv ON sv.user_id = h.user_id
    WHERE h.visible AND h.user_id <> actor
      AND NOT private.haroolife_dm_blocked(actor, h.user_id)
      AND (v_search IS NULL OR lower(h.display_name) LIKE v_like OR u.username LIKE v_like)
    ORDER BY online DESC, seen DESC NULLS LAST, h.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 30), 50))
  ) x;
  RETURN jsonb_build_object('online', private.haroolife_online_count(),
                            'players', private.haroolife_resident_count(),
                            'list', out);
END $$;

REVOKE ALL ON FUNCTION private.haroolife_online_count(), private.haroolife_resident_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.haroolife_here(text), public.haroolife_players(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.haroolife_here(text), public.haroolife_players(text, integer) TO authenticated;
