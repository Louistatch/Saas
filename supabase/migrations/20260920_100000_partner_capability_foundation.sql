-- ─────────────────────────────────────────────────────────────────────────────
-- Capacité Opérateur/Partenaire certifié — fondations (PR 1 du plan à 4 PR)
--
-- Un compte porte déjà deux couches indépendantes : organisationnelle
-- (`profiles.role`) et Haroo (`profiles.haroo_type`). Le Partenaire est une
-- TROISIÈME couche, structurellement séparée des deux premières :
--   - jamais une valeur de `user_role` ;
--   - jamais une valeur de `haroo_type` ;
--   - un compte doit pouvoir être admin de coopérative ET ouvrier Haroo ET
--     opérateur certifié, simultanément, sur un seul compte.
--
-- D'où un domaine à part : `partners` (l'entité business, qui peut un jour
-- compter plusieurs comptes) + `partner_memberships` (qui, dans quel rôle).
-- Un individu aujourd'hui, une entreprise avec gérant/agent/imprimeur de
-- cartes demain, sans refonte du schéma.
--
-- Portée de cette migration (PR 1 — fondations, sans portefeuille) :
--   partners, partner_memberships, partner_certifications,
--   partner_organization_assignments (+ périmètres d'accès), RLS, gardes SQL.
-- PR 2 (facturation), PR 3 (carte physique) et PR 4 (UI) viennent après.
--
-- Décision prise après audit, pas dans le prompt d'origine : le prompt
-- suggère de réutiliser AgriAcademy pour la formation (§10). Vérifié avant
-- d'écrire cette migration — `academy_progress.member_id` référence
-- `members(id)`, qui exige `cooperative_id NOT NULL`. Un candidat opérateur
-- sans organisation (le cas courant : un Haroo seul qui se certifie) n'a
-- justement pas de ligne `members` et ne pourrait pas y suivre sa
-- progression. AgriAcademy fournit donc le CONTENU (`academy_modules`,
-- `academy_lessons`, réutilisés tels quels si un module est désigné pour la
-- certification), mais `partner_certifications` doit suivre l'état de
-- certification par `profiles.id`, pas par `members.id` — exactement le cas
-- que le prompt réserve à une table dédiée : « information AgriAcademy
-- cannot represent cleanly ».
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE partner_status AS ENUM (
  'candidate',     -- inscrit, formation pas commencée
  'training',      -- formation AgriAcademy en cours
  'exam_pending',  -- évaluation pratique en attente
  'certified',     -- certifié, frais payé, pas encore actif commercialement
  'active',        -- opérationnel, peut prendre des mandats
  'suspended',     -- suspendu (temporaire, réversible)
  'expired',       -- certification arrivée à échéance
  'revoked'        -- révoqué (définitif, décision admin)
);

CREATE TYPE partner_membership_role AS ENUM ('owner', 'manager', 'agent');
CREATE TYPE partner_membership_status AS ENUM ('active', 'revoked');
CREATE TYPE partner_assignment_status AS ENUM ('active', 'revoked', 'ended');

-- Périmètres d'accès délégué (§14 du plan). Un ensemble fermé plutôt que des
-- colonnes booléennes ad hoc — la liste est le contrat, pas le schéma.
CREATE TYPE partner_access_scope AS ENUM (
  'members.read', 'members.manage',
  'cards.read', 'cards.manage', 'cards.print',
  'kobo.manage',
  'imports.manage',
  'analytics.read',
  'reports.generate',
  'projects.manage',
  'support.manage'
);

-- ── partners ─────────────────────────────────────────────────────────────
-- L'entité business. `partner_code` est l'identifiant public (façon
-- TG-<préfecture>-<séquence>, cf. lib/utils/card-number.ts pour le générateur
-- applicatif) — jamais l'UUID, qui ne doit pas fuiter dans une URL publique.

CREATE TABLE partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code text NOT NULL UNIQUE,
  business_name text,
  display_name text NOT NULL,
  phone text,
  email text,
  region_id uuid REFERENCES regions(id),
  prefecture_id uuid REFERENCES prefectures(id),
  status partner_status NOT NULL DEFAULT 'candidate',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  suspended_at timestamptz
);

COMMENT ON TABLE partners IS
  'Entité business du Partenaire/Opérateur certifié. Troisième couche de compte, indépendante de profiles.role et profiles.haroo_type. billing_mode arrive en PR 2 (facturation) — aucune colonne financière ici volontairement.';

CREATE INDEX idx_partners_status ON partners(status);
CREATE INDEX idx_partners_prefecture ON partners(prefecture_id);

-- ── partner_memberships ──────────────────────────────────────────────────
-- Qui, dans quel rôle, pour quel Partenaire. `user_id` référence `profiles`
-- (jamais `auth.users` directement) : c'est `profiles` qui fait foi partout
-- ailleurs dans ce dépôt, et la ligne existe toujours (posée par
-- handle_new_user()) avant qu'aucune couche ne s'active.

CREATE TABLE partner_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  membership_role partner_membership_role NOT NULL DEFAULT 'owner',
  status partner_membership_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, user_id)
);

COMMENT ON TABLE partner_memberships IS
  'Un compte peut appartenir à plusieurs Partenaires ; un Partenaire peut compter plusieurs comptes (gérant, agent de terrain, imprimeur de cartes). Écriture réservée à service_role — cf. RLS : une bascule de statut est une décision administrative, jamais un UPDATE direct par l''utilisateur.';

CREATE INDEX idx_partner_memberships_user ON partner_memberships(user_id) WHERE status = 'active';
CREATE INDEX idx_partner_memberships_partner ON partner_memberships(partner_id) WHERE status = 'active';

-- ── partner_certifications ───────────────────────────────────────────────
-- Suit l'état de certification par compte, pas par membre de coopérative
-- (voir la note en tête de fichier). `academy_module_id` est nullable et
-- sans contrainte de contenu : le module « Opérateur certifié » n'existe pas
-- encore dans academy_modules, il sera désigné par l'équipe produit sans
-- migration supplémentaire.

CREATE TABLE partner_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  academy_module_id uuid REFERENCES academy_modules(id),
  training_completed_at timestamptz,
  exam_score integer CHECK (exam_score IS NULL OR (exam_score >= 0 AND exam_score <= 100)),
  exam_passed_at timestamptz,
  -- Le règlement de paiement (15 000 XOF) arrive avec PR 2 ; cette colonne
  -- n'est qu'un repère temporel posé par la route d'approbation admin tant
  -- qu'aucune table de paiement Partenaire n'existe.
  certified_at timestamptz,
  partner_id uuid REFERENCES partners(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

COMMENT ON TABLE partner_certifications IS
  'État de certification par compte (profiles.id), pas par membre de coopérative — un candidat sans organisation doit pouvoir se certifier. Formation réutilise academy_modules/academy_lessons (§10 du plan) ; cette table couvre ce qu''AgriAcademy ne représente pas : progression liée à un compte plutôt qu''à un membre.';

-- ── partner_organization_assignments ─────────────────────────────────────
-- « Cette organisation a autorisé cet opérateur à effectuer ces services. »
-- Jamais une hiérarchie de propriété : le Partenaire n'est au-dessus d'aucune
-- coopérative, il a un accès délégué, révocable sans toucher aux données de
-- l'organisation (§15, §16 du plan).

CREATE TABLE partner_organization_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  cooperative_id uuid NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
  status partner_assignment_status NOT NULL DEFAULT 'active',
  is_primary_operator boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  approved_by uuid REFERENCES profiles(id),
  revoked_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE partner_organization_assignments IS
  'Accès délégué, jamais une propriété : révoquer ce mandat ne touche à aucune donnée de members/cards/cotisations/parcelles. project_id (mandat lié à un projet financé, §50 du plan) est volontairement omis ici — la table `projects` n''existe pas encore ; l''ajouter sera une migration additive, pas une refonte.';

-- Un seul mandat ACTIF par (partenaire, coopérative) — en révoquer un avant
-- d'en poser un nouveau, jamais un doublon silencieux.
CREATE UNIQUE INDEX idx_partner_assignment_active_unique
  ON partner_organization_assignments(partner_id, cooperative_id)
  WHERE status = 'active';

CREATE INDEX idx_partner_assignments_coop ON partner_organization_assignments(cooperative_id) WHERE status = 'active';
CREATE INDEX idx_partner_assignments_partner ON partner_organization_assignments(partner_id) WHERE status = 'active';

-- ── partner_assignment_scopes ────────────────────────────────────────────
-- Ensemble de périmètres par mandat. Table de jointure plutôt que des
-- colonnes booléennes (§14, explicite dans le plan) : ajouter un périmètre
-- demain n'est qu'une valeur d'enum de plus, pas une colonne de plus.

CREATE TABLE partner_assignment_scopes (
  assignment_id uuid NOT NULL REFERENCES partner_organization_assignments(id) ON DELETE CASCADE,
  scope partner_access_scope NOT NULL,
  PRIMARY KEY (assignment_id, scope)
);

-- ── Fonctions SQL — mêmes conventions que has_org_access()/current_haroo_type() ──
-- STABLE SECURITY DEFINER, search_path pinné : évite qu'une policy RLS soit
-- contournée par un search_path manipulé, cf. 20260919_091000.

CREATE OR REPLACE FUNCTION current_partner_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(array_agg(partner_id), ARRAY[]::uuid[])
  FROM partner_memberships
  WHERE user_id = auth.uid() AND status = 'active';
$$;

COMMENT ON FUNCTION current_partner_ids() IS
  'Partenaires dont le compte courant est membre actif. Utilisée par les policies RLS de ce fichier et par lib/security/assert-partner-access.ts côté application.';

CREATE OR REPLACE FUNCTION has_partner_org_access(
  target_coop uuid,
  required_scope partner_access_scope DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM partner_organization_assignments a
    WHERE a.cooperative_id = target_coop
      AND a.status = 'active'
      AND a.partner_id = ANY(current_partner_ids())
      AND (
        required_scope IS NULL
        OR EXISTS (
          SELECT 1 FROM partner_assignment_scopes s
          WHERE s.assignment_id = a.id AND s.scope = required_scope
        )
      )
  );
$$;

COMMENT ON FUNCTION has_partner_org_access(uuid, partner_access_scope) IS
  'Le compte courant a-t-il, via un de ses Partenaires, un mandat actif sur cette coopérative — et le périmètre demandé si précisé. Un accès délégué, jamais une autorité organisationnelle : ne jamais l''utiliser à la place de has_org_access() pour une décision qui doit rester à l''organisation.';

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Écriture réservée à service_role sur toutes ces tables : chaque transition
-- (candidat → certifié, mandat posé/révoqué) est une décision administrative
-- qui passe par une route serveur avec le client admin — même schéma que
-- app/api/account/activate-haroo/route.ts. Jamais un UPDATE direct par
-- l'utilisateur, même sur sa propre ligne : le statut d'un Partenaire n'est
-- pas une préférence de profil.

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_organization_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_assignment_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partners: membres et super_admin lisent" ON partners
  FOR SELECT TO authenticated
  USING (
    id = ANY(current_partner_ids())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "partner_memberships: équipe et super_admin lisent" ON partner_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR partner_id = ANY(current_partner_ids())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "partner_certifications: soi-même et super_admin lisent" ON partner_certifications
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "partner_assignments: partenaire, organisation, super_admin lisent" ON partner_organization_assignments
  FOR SELECT TO authenticated
  USING (
    partner_id = ANY(current_partner_ids())
    OR cooperative_id = ANY(get_accessible_cooperative_ids())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "partner_assignment_scopes: visibilité alignée sur le mandat" ON partner_assignment_scopes
  FOR SELECT TO authenticated
  USING (
    assignment_id IN (
      SELECT id FROM partner_organization_assignments
      WHERE partner_id = ANY(current_partner_ids())
         OR cooperative_id = ANY(get_accessible_cooperative_ids())
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ── protect_profile_privileges : aucun changement ────────────────────────
-- Ce trigger protège role/haroo_type/cooperative_id sur `profiles`. Le
-- Partenaire vit dans des tables séparées et n'a pas besoin d'y toucher —
-- exactement le découplage que le plan demande (§5).
