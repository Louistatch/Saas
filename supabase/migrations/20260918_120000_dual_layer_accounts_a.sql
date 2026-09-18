-- ─────────────────────────────────────────────────────────────────────────────
-- Compte unique à deux couches — étape A (purement additive)
--
-- Contexte : profiles.role est un scalaire unique qui mélange la couche
-- organisationnelle (super_admin / cooperative_admin / member / guest) et la
-- couche Haroo (ouvrier / acheteur / agronome). Un compte ne peut donc porter
-- qu'une seule des deux, et les deux parcours s'écrasent mutuellement :
-- bootstrap_cooperative_admin force role='cooperative_admin', tandis
-- qu'AgriTogo (app/haroo/auth.py) écrase role avec le type Haroo.
--
-- Cette migration n'est lue par personne : elle ne fait qu'ajouter le terrain.
-- Le backfill, le changement de handle_new_user() et la réécriture des
-- policies arrivent en étape B, qui doit partir en lockstep avec le front.
--
-- Les valeurs ouvrier/acheteur/agronome restent dans user_role : Postgres ne
-- sait pas supprimer un label d'enum, et une quinzaine de fichiers RLS les
-- référencent. Elles sont dépréciées, plus utilisées.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Couche Haroo : enum dédié, distinct de user_role ────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'haroo_profile_type') THEN
    CREATE TYPE haroo_profile_type AS ENUM ('ouvrier', 'acheteur', 'agronome');
  END IF;
END$$;

-- ── Label « aucune couche organisationnelle » ───────────────────────────────
-- Volontairement ajouté ici sans être utilisé : Postgres interdit d'employer
-- un label neuf dans la transaction qui le crée. L'étape B pourra s'en servir.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'none';

-- ── Colonnes de la seconde couche ───────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS haroo_type         haroo_profile_type,
  ADD COLUMN IF NOT EXISTS haroo_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS org_activated_at   timestamptz;

COMMENT ON COLUMN profiles.role IS
  'Couche organisationnelle uniquement. Les valeurs ouvrier/acheteur/agronome sont dépréciées : utiliser profiles.haroo_type.';
COMMENT ON COLUMN profiles.haroo_type IS
  'Couche Haroo. NULL = non activée. Un seul profil à la fois.';

-- Un compte Haroo se retrouve via cette colonne dans le dashboard et les
-- policies ; l'index sert les listes admin et le filtrage par type.
CREATE INDEX IF NOT EXISTS profiles_haroo_type_idx
  ON profiles (haroo_type) WHERE haroo_type IS NOT NULL;

-- ── Helpers RLS ─────────────────────────────────────────────────────────────
-- Les policies actuelles répètent partout :
--   EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
--           AND cooperative_id = <t>.cooperative_id AND role IN (...))
-- L'étape B les réécrit sur ces deux fonctions, pour qu'il n'existe qu'un seul
-- endroit où la règle d'accès organisationnel est définie.
CREATE OR REPLACE FUNCTION public.has_org_access(
  target_coop uuid,
  allowed     user_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.cooperative_id = target_coop
      AND p.role = ANY(allowed)
  );
$$;

COMMENT ON FUNCTION public.has_org_access IS
  'Accès couche organisationnelle : le compte courant appartient-il à target_coop avec un rôle autorisé.';

CREATE OR REPLACE FUNCTION public.current_haroo_type()
RETURNS haroo_profile_type
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT haroo_type FROM profiles WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.current_haroo_type IS
  'Type de profil Haroo du compte courant, NULL si la couche n''est pas activée.';

REVOKE ALL ON FUNCTION public.has_org_access(uuid, user_role[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_haroo_type() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_org_access(uuid, user_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_haroo_type() TO authenticated;
