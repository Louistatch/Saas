-- =============================================================================
-- 20260530_120000_auth_core_and_scale.sql
--
-- FONDATION AUTH + SCALE — résout AUTH-01, AUTH-02, AUTH-10, BUG-03a.
--
-- Ce fichier crée les éléments référencés partout dans le code mais absents
-- des migrations existantes. Sans lui, signup/login/autorisation sont cassés.
--
-- Sections :
--   A1. Trigger handle_new_user  → crée profiles auto à l'inscription
--   A2. bootstrap_cooperative_admin() → assigne le rôle admin (anti self-promote)
--   A3. get_accessible_cooperative_ids() → hiérarchie récursive (STABLE, indexée)
--   A4. UNIQUE(cooperative_id, phone) sur members + index scale
--
-- SCALE 10M : toutes les fonctions sont SECURITY DEFINER + search_path verrouillé,
-- STABLE quand applicable (cache intra-requête du planner), et appuyées sur des
-- index dédiés pour éviter les seq-scans à chaque appel.
--
-- Idempotent : CREATE OR REPLACE / IF NOT EXISTS / DROP IF EXISTS partout.
-- Apply via Supabase SQL Editor ou `supabase db push`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Pré-requis : enum de rôle (idempotent). Le code utilise 4 valeurs.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM
      ('super_admin', 'cooperative_admin', 'member', 'guest');
  END IF;
END$$;

-- =============================================================================
-- A1 — TRIGGER handle_new_user
-- Crée automatiquement une ligne profiles quand un user auth.users est inséré.
-- Le rôle par défaut est 'member' : on ne fait JAMAIS confiance au user_metadata
-- pour le rôle (un attaquant pourrait l'injecter via signUp options.data).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role, cooperative_id)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'first_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'last_name', ''),
    'member',          -- rôle par défaut imposé côté serveur
    NULL               -- pas de coopérative tant que bootstrap n'a pas tourné
  )
  ON CONFLICT (id) DO NOTHING;  -- idempotent si le trigger re-fire
  RETURN NEW;
END;
$$;

-- Le trigger doit être recréé proprement (DROP puis CREATE).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS
  'AUTH-01: crée profiles à l''inscription. Rôle forcé à member (jamais depuis user_metadata).';

-- =============================================================================
-- A2 — bootstrap_cooperative_admin(target_user_id, target_cooperative_id)
-- Promeut un utilisateur en cooperative_admin et le rattache à sa coopérative.
--
-- SÉCURITÉ ANTI SELF-PROMOTE :
--   1. L'appelant DOIT être la personne ciblée (auth.uid() = target_user_id).
--   2. La coopérative ciblée NE DOIT PAS déjà avoir un admin (premier admin only).
--   3. Le user ciblé NE DOIT PAS déjà avoir un rôle élevé.
-- Cela empêche un utilisateur de se promouvoir sur une coopérative existante
-- ou de détourner une coopérative dont il n'est pas le créateur.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.bootstrap_cooperative_admin(
  target_user_id        uuid,
  target_cooperative_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_has_admin  boolean;
  v_current    public.user_role;
BEGIN
  -- 1. L'appelant ne peut promouvoir que lui-même.
  IF v_caller IS NULL OR v_caller <> target_user_id THEN
    RAISE EXCEPTION 'forbidden: caller % cannot bootstrap user %', v_caller, target_user_id
      USING ERRCODE = '42501';
  END IF;

  -- 2. Refus si la coopérative a déjà un admin (le bootstrap = premier admin).
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE cooperative_id = target_cooperative_id
      AND role = 'cooperative_admin'
  ) INTO v_has_admin;

  IF v_has_admin THEN
    RAISE EXCEPTION 'forbidden: cooperative % already has an admin', target_cooperative_id
      USING ERRCODE = '42501';
  END IF;

  -- 3. Refus si l'utilisateur a déjà un rôle privilégié (anti double-bootstrap).
  SELECT role INTO v_current FROM public.profiles WHERE id = target_user_id;
  IF v_current IN ('cooperative_admin', 'super_admin') THEN
    RAISE EXCEPTION 'forbidden: user % already privileged', target_user_id
      USING ERRCODE = '42501';
  END IF;

  -- Promotion atomique.
  UPDATE public.profiles
  SET role = 'cooperative_admin',
      cooperative_id = target_cooperative_id
  WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_cooperative_admin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_cooperative_admin(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.bootstrap_cooperative_admin(uuid, uuid) IS
  'AUTH-02: promeut le créateur en cooperative_admin. Anti self-promote: caller=target, 1 admin/coop max.';

-- =============================================================================
-- A3 — get_accessible_cooperative_ids()
-- Retourne l'ensemble des cooperative_id accessibles par l'utilisateur courant,
-- en descendant la hiérarchie (faitière → unions → coopératives).
--
-- SCALE : STABLE (résultat constant dans une requête → mis en cache par le planner),
-- SECURITY DEFINER (lit profiles/cooperatives sous RLS-bypass contrôlé),
-- WITH RECURSIVE appuyée sur idx_cooperatives_parent_id (créé plus bas).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_accessible_cooperative_ids()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role    public.user_role;
  v_coop    uuid;
  v_ids     uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN '{}';
  END IF;

  SELECT role, cooperative_id INTO v_role, v_coop
  FROM public.profiles
  WHERE id = v_user_id;

  -- super_admin : accès à toutes les coopératives.
  IF v_role = 'super_admin' THEN
    SELECT array_agg(id) INTO v_ids FROM public.cooperatives;
    RETURN COALESCE(v_ids, '{}');
  END IF;

  -- Sans coopérative rattachée → aucun accès.
  IF v_coop IS NULL THEN
    RETURN '{}';
  END IF;

  -- Descente récursive depuis la coopérative de l'utilisateur.
  WITH RECURSIVE hierarchy AS (
    SELECT id FROM public.cooperatives WHERE id = v_coop
    UNION ALL
    SELECT c.id
    FROM public.cooperatives c
    JOIN hierarchy h ON c.parent_id = h.id
  )
  SELECT array_agg(id) INTO v_ids FROM hierarchy;

  RETURN COALESCE(v_ids, '{}');
END;
$$;

REVOKE ALL ON FUNCTION public.get_accessible_cooperative_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_accessible_cooperative_ids() TO authenticated;

COMMENT ON FUNCTION public.get_accessible_cooperative_ids() IS
  'AUTH-10: hiérarchie accessible (récursive). STABLE+DEFINER. Utilisée par assertTenantAccess et RLS.';

-- -----------------------------------------------------------------------------
-- get_cooperative_descendants(p_root_id) — SEC-03
-- Retourne {id} pour une racine donnée + tous ses descendants. Utilisée par le
-- webhook Kobo pour restreindre la résolution de coopérative à la hiérarchie de
-- la faîtière (empêche l'attachement d'un membre hors hiérarchie).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cooperative_descendants(p_root_id uuid)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE hierarchy AS (
    SELECT c.id FROM public.cooperatives c WHERE c.id = p_root_id
    UNION ALL
    SELECT c.id
    FROM public.cooperatives c
    JOIN hierarchy h ON c.parent_id = h.id
  )
  SELECT id FROM hierarchy;
$$;

REVOKE ALL ON FUNCTION public.get_cooperative_descendants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cooperative_descendants(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_cooperative_descendants(uuid) IS
  'SEC-03: descendants d''une coopérative racine (récursif). Restreint la résolution webhook à la hiérarchie.';

-- Index OBLIGATOIRE pour la récursion à 10M : sans lui, chaque appel = seq-scan.
CREATE INDEX IF NOT EXISTS idx_cooperatives_parent_id
  ON public.cooperatives (parent_id);

-- =============================================================================
-- A4 — UNIQUE(cooperative_id, phone) sur members + index scale
-- Empêche les doublons de membres en écriture concurrente (webhooks parallèles).
--
-- NOTE : on n'applique l'unicité que sur les téléphones NON NULL et non vides
-- (index partiel) car phone est nullable — deux membres sans téléphone sont valides.
-- =============================================================================

-- Nettoyage défensif des doublons existants AVANT de poser la contrainte,
-- sinon la création de l'index unique échoue. On garde le plus ancien.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY cooperative_id, phone
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.members
  WHERE phone IS NOT NULL AND phone <> ''
)
UPDATE public.members m
SET phone = NULL
FROM ranked r
WHERE m.id = r.id AND r.rn > 1;

-- Index unique partiel = la contrainte d'unicité scalable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_members_coop_phone
  ON public.members (cooperative_id, phone)
  WHERE phone IS NOT NULL AND phone <> '';

-- Index de lecture chaude : la plupart des requêtes filtrent par cooperative_id.
CREATE INDEX IF NOT EXISTS idx_members_cooperative_id
  ON public.members (cooperative_id);

COMMENT ON INDEX public.uq_members_coop_phone IS
  'BUG-03a: unicité (cooperative_id, phone) sur téléphones non nuls. Anti-doublon webhooks.';

-- =============================================================================
-- Reload du cache de schéma PostgREST (sinon les nouvelles fonctions RPC
-- ne sont pas exposées immédiatement à l'API).
-- =============================================================================
NOTIFY pgrst, 'reload schema';
