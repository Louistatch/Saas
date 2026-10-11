-- HarooLife national : chaque compte a une place sur le territoire (région → préfecture → canton)
-- et un rôle déduit de ses données réelles. Additif : aucune table, politique ni fonction du
-- pilote n'est modifiée. NON APPLIQUÉE en production tant que le fondateur ne l'a pas validée.
-- Retour arrière : supabase/rollbacks/20261012_120000_haroolife_togo.rollback.sql

-- 1. Résidence choisie par la personne (jamais déduite de force) : canton, nom affiché, pagne.
CREATE TABLE public.haroolife_residents (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  canton_id uuid NOT NULL REFERENCES public.cantons(id),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 40),
  pagne smallint NOT NULL DEFAULT 1 CHECK (pagne BETWEEN 1 AND 8),
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX haroolife_residents_canton ON public.haroolife_residents(canton_id) WHERE visible;
ALTER TABLE public.haroolife_residents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_residents FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haroolife_residents TO service_role;

-- 2. Rôles d'un compte, déduits des données (jamais déclarés par la personne).
CREATE OR REPLACE FUNCTION private.haroolife_roles(p_user uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(r ORDER BY r), '{}') FROM (
    SELECT 'equipe' AS r FROM public.profiles p WHERE p.id = p_user AND p.role = 'super_admin'
    UNION
    SELECT CASE c.level WHEN 'faitiere' THEN 'faitiere' WHEN 'union' THEN 'union' ELSE 'admin_coop' END
      FROM public.profiles p JOIN public.cooperatives c ON c.id = p.cooperative_id
      WHERE p.id = p_user AND p.role = 'cooperative_admin'
    UNION
    SELECT 'producteur' FROM public.profiles p WHERE p.id = p_user AND p.role = 'member'
    UNION
    SELECT p.haroo_type::text FROM public.profiles p
      WHERE p.id = p_user AND p.haroo_type::text IN ('ouvrier','acheteur','agronome')
    UNION
    SELECT 'operateur' FROM public.partner_memberships m
      JOIN public.partners pa ON pa.id = m.partner_id
      JOIN public.partner_certifications c ON c.partner_id = pa.id AND c.user_id = m.user_id
      WHERE m.user_id = p_user AND m.status = 'active' AND c.certified_at IS NOT NULL
        AND pa.status IN ('certified','active')
  ) x;
$$;

-- 3. Canton suggéré à la première visite, à partir de ce que la plateforme sait déjà.
CREATE OR REPLACE FUNCTION public.haroolife_suggest_canton()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT canton_id FROM (
    SELECT c.canton_id, 1 AS rank FROM public.haroo_ouvrier_profiles w
      JOIN public.haroo_ouvrier_cantons c ON c.ouvrier_id = w.id WHERE w.user_id = (SELECT auth.uid())
    UNION ALL
    SELECT c.canton_id, 2 FROM public.haroo_acheteur_profiles a
      JOIN public.haroo_acheteur_cantons c ON c.acheteur_id = a.id WHERE a.user_id = (SELECT auth.uid())
    UNION ALL
    SELECT a.canton_id, 3 FROM public.haroo_agronome_profiles a
      WHERE a.user_id = (SELECT auth.uid()) AND a.canton_id IS NOT NULL
    UNION ALL
    SELECT m.canton_id, 4 FROM public.members m JOIN public.profiles p ON lower(p.email) = lower(m.email)
      WHERE p.id = (SELECT auth.uid()) AND m.deleted_at IS NULL AND m.canton_id IS NOT NULL
    UNION ALL
    -- Administrateur : le canton où vivent le plus de membres de son arbre d'organisations
    -- (une faîtière a ses membres dans ses unions et coopératives).
    SELECT t.canton_id, 5 FROM (
      SELECT m.canton_id FROM public.members m
      WHERE m.cooperative_id = ANY (public.get_accessible_cooperative_ids())
        AND m.deleted_at IS NULL AND m.canton_id IS NOT NULL
      GROUP BY m.canton_id ORDER BY count(*) DESC LIMIT 1) t
  ) s ORDER BY rank LIMIT 1;
$$;

-- 4. Choisir ou changer sa maison. Le nom affiché est libre (prénom ou surnom), court.
CREATE OR REPLACE FUNCTION public.haroolife_set_home(p_canton uuid, p_display_name text, p_pagne integer DEFAULT 1, p_visible boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid());
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = actor AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Compte introuvable' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cantons WHERE id = p_canton) THEN
    RAISE EXCEPTION 'Canton inconnu' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.haroolife_residents(user_id, canton_id, display_name, pagne, visible)
    VALUES (actor, p_canton, trim(p_display_name), p_pagne, p_visible)
  ON CONFLICT (user_id) DO UPDATE
    SET canton_id = excluded.canton_id, display_name = excluded.display_name,
        pagne = excluded.pagne, visible = excluded.visible, updated_at = now();
END $$;

-- 5. Le monde : territoire avec effectifs réels, et « ici » pour un canton. Lecture seule.
--    Aucun téléphone, aucun e-mail : nom affiché, pagne, rôles.
CREATE OR REPLACE FUNCTION public.haroolife_world(p_canton uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := (SELECT auth.uid());
  home public.haroolife_residents;
  here uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  SELECT * INTO home FROM public.haroolife_residents WHERE user_id = actor;
  here := coalesce(p_canton, home.canton_id);
  RETURN jsonb_build_object(
    'me', jsonb_build_object(
      'roles', to_jsonb(private.haroolife_roles(actor)),
      'display_name', home.display_name,
      'pagne', home.pagne,
      'visible', home.visible,
      'home', CASE WHEN home.canton_id IS NULL THEN NULL ELSE (
        SELECT jsonb_build_object('canton_id', c.id, 'canton', c.name, 'prefecture', pf.name,
                                  'region', r.name, 'region_code', r.code)
        FROM public.cantons c JOIN public.prefectures pf ON pf.id = c.prefecture_id
        JOIN public.regions r ON r.id = pf.region_id WHERE c.id = home.canton_id) END,
      'suggested_canton', CASE WHEN home.canton_id IS NULL THEN public.haroolife_suggest_canton() END
    ),
    'territory', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'code', r.code,
        'residents', (SELECT count(*) FROM public.haroolife_residents h
                      JOIN public.cantons c ON c.id = h.canton_id
                      JOIN public.prefectures pf ON pf.id = c.prefecture_id WHERE pf.region_id = r.id),
        'prefectures', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', pf.id, 'name', pf.name,
            'residents', (SELECT count(*) FROM public.haroolife_residents h
                          JOIN public.cantons c ON c.id = h.canton_id WHERE c.prefecture_id = pf.id),
            'cantons', (
              SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', c.id, 'name', c.name,
                'residents', (SELECT count(*) FROM public.haroolife_residents h WHERE h.canton_id = c.id)
              ) ORDER BY c.name), '[]') FROM public.cantons c WHERE c.prefecture_id = pf.id)
          ) ORDER BY pf.name), '[]') FROM public.prefectures pf WHERE pf.region_id = r.id)
      ) ORDER BY r.name), '[]') FROM public.regions r),
    'here', CASE WHEN here IS NULL THEN NULL ELSE jsonb_build_object(
      'canton', (SELECT jsonb_build_object('canton_id', c.id, 'canton', c.name, 'prefecture', pf.name,
                                           'region', r.name, 'region_code', r.code)
                 FROM public.cantons c JOIN public.prefectures pf ON pf.id = c.prefecture_id
                 JOIN public.regions r ON r.id = pf.region_id WHERE c.id = here),
      'residents', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'display_name', h.display_name, 'pagne', h.pagne,
          'roles', to_jsonb(private.haroolife_roles(h.user_id)),
          'is_me', h.user_id = actor
        ) ORDER BY (h.user_id = actor) DESC, h.display_name), '[]')
        FROM public.haroolife_residents h WHERE h.canton_id = here AND (h.visible OR h.user_id = actor)),
      'cooperatives', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('id', co.id, 'name', co.name, 'level', co.level,
                                                     'members', co.n) ORDER BY co.n DESC), '[]')
        FROM (SELECT c.id, c.name, c.level, count(m.id) AS n FROM public.cooperatives c
              JOIN public.members m ON m.cooperative_id = c.id AND m.deleted_at IS NULL
              WHERE m.canton_id = here AND c.deleted_at IS NULL GROUP BY c.id) co),
      'groups', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', g.id, 'kind', g.kind, 'title', g.title, 'activity', g.activity,
          'starts_on', g.starts_on, 'ends_on', g.ends_on, 'target', g.target,
          'people', (SELECT count(*) FROM public.haroolife_participations p WHERE p.group_id = g.id AND p.left_at IS NULL),
          'total', (SELECT coalesce(sum(p.amount), 0) FROM public.haroolife_participations p WHERE p.group_id = g.id AND p.left_at IS NULL),
          'expires_at', g.expires_at, 'is_owner', g.owner_id = actor
        ) ORDER BY g.starts_on), '[]')
        FROM public.haroolife_groups g
        WHERE g.canton_id = here AND g.cancelled_at IS NULL AND g.expires_at > now())
    ) END
  );
END $$;

REVOKE ALL ON FUNCTION private.haroolife_roles(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.haroolife_suggest_canton(), public.haroolife_set_home(uuid, text, integer, boolean),
  public.haroolife_world(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.haroolife_suggest_canton(), public.haroolife_set_home(uuid, text, integer, boolean),
  public.haroolife_world(uuid) TO authenticated, service_role;
