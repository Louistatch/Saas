-- ─────────────────────────────────────────────────────────────────────────────
-- Compte unique à deux couches — étape B
--
-- Bascule effective : les 3 comptes Haroo passent sur profiles.haroo_type, le
-- trigger d'inscription cesse d'accorder 'member' par défaut, et `profiles`
-- devient réellement la seule source d'autorisation.
--
-- Contient aussi deux correctifs de sécurité découverts en auditant profiles
-- pour cette bascule — voir les sections 1 et 2, qui sont indépendantes du
-- compte à deux couches mais indissociables de la décision « profiles fait
-- foi » : tant qu'un utilisateur peut écrire son propre rôle, aucune source de
-- vérité ne tient.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. FAILLE — élévation de privilège par mise à jour de son propre profil
--
-- Les policies « Users can update their own profile » (role public, USING
-- auth.uid() = id) et profiles_own_update n'imposent aucune restriction de
-- colonne. Comme getAccessContext() lit profiles.role, n'importe quel compte
-- connecté pouvait se promouvoir :
--     PATCH /rest/v1/profiles?id=eq.<son id>   {"role": "super_admin"}
-- soit une prise de contrôle complète de la plateforme. La colonne haroo_type
-- ajoutée à l'étape A aurait hérité du même trou, permettant de contourner
-- /api/account/activate-haroo.
--
-- Postgres ne sait pas restreindre les colonnes dans une policy, et un GRANT
-- par colonne serait trop brutal : il s'applique au rôle `authenticated`, donc
-- bloquerait aussi les super_admins qui éditent légitimement les rôles depuis
-- /admin/users, ainsi que bootstrap_cooperative_admin. D'où un trigger, qui
-- distingue l'appelant.
-- ═════════════════════════════════════════════════════════════════════════════

-- SECURITY INVOKER délibérément : le trigger doit voir le rôle Postgres réel
-- de l'appelant. En SECURITY DEFINER, current_user vaudrait toujours le
-- propriétaire de la fonction et le garde-fou ne se déclencherait jamais.
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  -- Deux appelants légitimes échappent au contrôle :
  --   • service_role — le backend de confiance, qui pose la couche Haroo
  --   • toute fonction SECURITY DEFINER de la base, où current_user devient
  --     son propriétaire. C'est le cas de bootstrap_cooperative_admin, qui
  --     promeut l'utilisateur en cooperative_admin : sans cette porte, créer
  --     une coopérative deviendrait impossible.
  -- Un utilisateur ordinaire arrive ici en 'authenticated'.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.role           IS DISTINCT FROM OLD.role
  OR NEW.haroo_type     IS DISTINCT FROM OLD.haroo_type
  OR NEW.cooperative_id IS DISTINCT FROM OLD.cooperative_id
  OR NEW.id             IS DISTINCT FROM OLD.id
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'::user_role
    ) THEN
      RAISE EXCEPTION
        'Rôle, couche Haroo et rattachement ne sont pas modifiables par leur titulaire';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS protect_profile_privileges_trg ON profiles;
CREATE TRIGGER protect_profile_privileges_trg
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. BUG — la policy super_admin de profiles ne matche jamais
--
-- « Super admins can update all profiles » teste (auth.jwt() ->> 'role'), qui
-- est la revendication Postgres du jeton et vaut 'authenticated' pour tout
-- utilisateur normal, jamais 'super_admin'. Conséquence : l'édition des rôles
-- depuis /admin/users (app/admin/users/page.tsx:104) échouait silencieusement,
-- aucun super_admin ne pouvant cibler une autre ligne que la sienne.
-- ═════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Super admins can update all profiles" ON profiles;

CREATE POLICY "profiles_super_admin_update" ON profiles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'::user_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'::user_role)
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Bascule des comptes Haroo vers la colonne dédiée
--
-- Aucune policy de la base ne référence ouvrier/acheteur/agronome (vérifié) :
-- ces comptes ne perdent donc aucun accès en passant à 'none'.
-- ═════════════════════════════════════════════════════════════════════════════

UPDATE profiles
SET haroo_type = role::text::haroo_profile_type,
    haroo_activated_at = coalesce(haroo_activated_at, created_at)
WHERE role IN ('ouvrier', 'acheteur', 'agronome')
  AND haroo_type IS NULL;

UPDATE profiles
SET role = 'none'::user_role
WHERE role IN ('ouvrier', 'acheteur', 'agronome');

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Le trigger d'inscription n'accorde plus 'member' par défaut
--
-- 'member' signifie « appartient à une coopérative » dans 39 policies. L'offrir
-- par défaut donnait une couche organisationnelle à tout nouveau compte, y
-- compris aux professionnels Haroo. 'none' n'ouvre rien : bootstrap_cooperative_admin
-- promeut ensuite les comptes organisationnels, et la couche Haroo se pose
-- dans sa propre colonne — les deux parcours cessent de s'écraser.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role, cooperative_id)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'first_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'last_name', ''),
    'none',
    NULL
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

-- bootstrap_cooperative_admin ne refuse que les rôles déjà privilégiés
-- (cooperative_admin, super_admin) : 'none' passe, la promotion reste possible.
--
-- À NOTER, non corrigé ici volontairement : cette fonction n'a plus aucun
-- droit d'exécution pour `authenticated` (vérifié : has_function_privilege =
-- false pour anon comme authenticated). Un DROP/CREATE ultérieur a effacé le
-- GRANT posé par 002_platform_objects.sql. Conséquence : le parcours de
-- création autonome de coopérative (lib/auth/complete-signup.ts, qui appelle
-- cette RPC) échoue en « permission denied » — il est mort.
-- Le rétablir ouvrirait la création de coopérative en libre-service, ce qui
-- contredit la décision « les comptes organisationnels sont validés par
-- l'administration ». Le choix appartient au propriétaire du produit.
COMMENT ON FUNCTION public.handle_new_user IS
  'Crée profiles à l''inscription avec role=none : aucune couche accordée par défaut.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. audit_logs : une seule source de rôles
--
-- Cette policy était la dernière à lire app_metadata, magasin qui diverge déjà
-- de profiles en production (1 rôle renseigné sur 10 comptes).
-- ═════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "audit_logs_admin_read" ON audit_logs;

CREATE POLICY "audit_logs_admin_read" ON audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin'::user_role, 'cooperative_admin'::user_role)
    )
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Garde-fou : un rôle organisationnel implique une organisation
--
-- 'guest' est toléré sans rattachement : c'est une valeur de la couche
-- organisationnelle qui signifie déjà « sans organisation », et un compte la
-- porte encore. NOT VALID pour ne pas rejouer la contrainte sur l'existant ;
-- elle s'applique à toute écriture ultérieure.
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_org_role_needs_cooperative;
ALTER TABLE profiles ADD CONSTRAINT profiles_org_role_needs_cooperative
  CHECK (
    role IN ('none'::user_role, 'guest'::user_role, 'super_admin'::user_role)
    OR cooperative_id IS NOT NULL
  ) NOT VALID;
