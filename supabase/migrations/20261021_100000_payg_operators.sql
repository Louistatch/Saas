-- ─────────────────────────────────────────────────────────────────────────────
-- FaîtièreHub PAYG : crédits prépayés, opérateurs individuels et institutionnels, agents,
-- formation en tranches, impression, protection des données.
--
-- Architecture complète : docs/payg/architecture.md. Migration ADDITIVE : aucune ligne
-- supprimée, aucune colonne retirée. Seules modifications de l'existant :
--   - has_partner_org_access() : un agent n'agit que sur SES coopératives (owner/manager
--     inchangés ; en production les quatre adhésions sont des owners) ;
--   - private.enforce_cooperative_card_allowance() : une carte qui porte une commission
--     payée ne compte plus dans le quota gratuit de 10 (elle n'est plus bloquée) ; le cas
--     faitierehub.card_merge (fusion de doublons) est conservé à l'identique ;
--   - billing_rules.physical_card_fee (2 000 FCFA, 500/1 500) est close (effective_to), la
--     ligne reste pour l'historique.
-- Les nouvelles valeurs d'enum ne sont pas utilisées dans cette transaction (règle Postgres).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Types ────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.partner_operator_kind AS ENUM ('individual', 'institutional');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payg_credit_entry_type AS ENUM
    ('WELCOME', 'PURCHASE', 'CONSUME', 'RELEASE', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.card_commission_source AS ENUM ('welcome', 'purchased');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.card_commission_status AS ENUM ('consumed', 'released');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.training_payer AS ENUM ('self', 'institution');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.training_fee_status AS ENUM ('unpaid', 'partial', 'paid', 'waived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fh_print_order_status AS ENUM
    ('quote_requested', 'quoted', 'paid', 'in_production', 'shipped', 'delivered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.rectification_status AS ENUM ('open', 'in_progress', 'resolved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE public.partner_payment_purpose ADD VALUE IF NOT EXISTS 'credit_pack';
ALTER TYPE public.partner_payment_purpose ADD VALUE IF NOT EXISTS 'training_fee';
ALTER TYPE public.partner_payment_purpose ADD VALUE IF NOT EXISTS 'print_order';

-- ── 2. Opérateurs : individuel ou institutionnel ─────────────────────────────

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS operator_kind public.partner_operator_kind NOT NULL DEFAULT 'individual';

COMMENT ON COLUMN public.partners.operator_kind IS
  'individual : un professionnel indépendant. institutional : une fédération ou une entreprise (FENOMAT, MAPTO) dont les agents travaillent sur un portefeuille PAYG unique.';

-- ── 3. Crédits PAYG ──────────────────────────────────────────────────────────
-- Un crédit = une commission numérique (250 FCFA aujourd'hui). Le solde de partner_wallets
-- est un cache ; la vérité est payg_credit_ledger, en ajout seul.

ALTER TABLE public.partner_wallets
  ADD COLUMN IF NOT EXISTS credit_balance integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS welcome_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS welcome_granted_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.partner_wallets
    ADD CONSTRAINT partner_wallets_credits_check
    CHECK (credit_balance >= 0 AND welcome_credits >= 0 AND welcome_credits <= credit_balance);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tout opérateur a un portefeuille (le déclencheur de création existe depuis PR 2).
INSERT INTO public.partner_wallets (partner_id)
SELECT p.id FROM public.partners p
WHERE NOT EXISTS (SELECT 1 FROM public.partner_wallets w WHERE w.partner_id = p.id);

CREATE TABLE IF NOT EXISTS public.payg_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  entry_type public.payg_credit_entry_type NOT NULL,
  credits integer NOT NULL,
  -- Part des crédits offerts dans ce mouvement (signée) : sépare les commissions offertes
  -- des commissions réellement acquises.
  welcome_delta integer NOT NULL DEFAULT 0,
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  -- PURCHASE : argent reçu. CONSUME / RELEASE : valeur de la commission au moment du débit.
  amount_fcfa integer NOT NULL DEFAULT 0 CHECK (amount_fcfa >= 0),
  member_card_id uuid,
  cooperative_id uuid REFERENCES public.cooperatives(id),
  payment_intent_id uuid REFERENCES public.partner_payment_intents(id),
  actor_id uuid REFERENCES public.profiles(id),
  idempotency_key text NOT NULL UNIQUE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (entry_type IN ('WELCOME', 'PURCHASE', 'RELEASE') AND credits > 0)
    OR (entry_type = 'CONSUME' AND credits = -1)
    OR (entry_type = 'ADJUSTMENT' AND credits <> 0)
  )
);

COMMENT ON TABLE public.payg_credit_ledger IS
  'Grand livre des crédits PAYG, en ajout seul : jamais d''UPDATE ni de DELETE. Corriger par une écriture RELEASE ou ADJUSTMENT. Seules les fonctions payg_* y écrivent.';

CREATE INDEX IF NOT EXISTS idx_payg_ledger_partner ON public.payg_credit_ledger(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payg_ledger_actor ON public.payg_credit_ledger(actor_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_payg_ledger_no_update ON public.payg_credit_ledger;
CREATE TRIGGER trg_payg_ledger_no_update BEFORE UPDATE ON public.payg_credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
DROP TRIGGER IF EXISTS trg_payg_ledger_no_delete ON public.payg_credit_ledger;
CREATE TRIGGER trg_payg_ledger_no_delete BEFORE DELETE ON public.payg_credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

-- Une carte commerciale = une commission, et une seule (UNIQUE sur la carte). Les clés
-- étrangères vers member_cards sont différées : la commission est réservée juste avant la
-- carte, dans la même transaction, pour que le quota gratuit la reconnaisse.
CREATE TABLE IF NOT EXISTS public.card_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_card_id uuid NOT NULL UNIQUE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  cooperative_id uuid NOT NULL REFERENCES public.cooperatives(id),
  member_id uuid NOT NULL REFERENCES public.members(id),
  issued_by uuid REFERENCES public.profiles(id),
  source public.card_commission_source NOT NULL,
  commission_fcfa integer NOT NULL CHECK (commission_fcfa >= 0),
  billing_rule_id uuid REFERENCES public.billing_rules(id),
  card_format text NOT NULL DEFAULT 'digital' CHECK (card_format IN ('digital', 'plastified', 'pvc')),
  producer_price_fcfa integer CHECK (producer_price_fcfa IS NULL OR producer_price_fcfa >= 0),
  consume_ledger_id uuid NOT NULL REFERENCES public.payg_credit_ledger(id),
  status public.card_commission_status NOT NULL DEFAULT 'consumed',
  release_ledger_id uuid REFERENCES public.payg_credit_ledger(id),
  release_reason text,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.card_commissions
    ADD CONSTRAINT card_commissions_member_card_fkey FOREIGN KEY (member_card_id)
    REFERENCES public.member_cards(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.payg_credit_ledger
    ADD CONSTRAINT payg_credit_ledger_member_card_fkey FOREIGN KEY (member_card_id)
    REFERENCES public.member_cards(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_card_commissions_partner ON public.card_commissions(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_commissions_issuer ON public.card_commissions(issued_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_commissions_coop ON public.card_commissions(cooperative_id);

-- Rejouer une émission (double clic, réseau) renvoie la même carte, sans second débit.
CREATE TABLE IF NOT EXISTS public.card_issuance_requests (
  idempotency_key text PRIMARY KEY,
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  member_id uuid NOT NULL REFERENCES public.members(id),
  member_card_id uuid NOT NULL REFERENCES public.member_cards(id),
  mode text NOT NULL CHECK (mode IN ('commercial', 'free_allowance')),
  actor_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 4. Agents d'une institution ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.partner_agent_cooperatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cooperative_id uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  scopes public.partner_access_scope[] NOT NULL
    DEFAULT ARRAY['members.read', 'members.manage', 'cards.read', 'cards.manage', 'cards.print']::public.partner_access_scope[],
  status public.partner_assignment_status NOT NULL DEFAULT 'active',
  assigned_by uuid REFERENCES public.profiles(id),
  revoked_by uuid REFERENCES public.profiles(id),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.partner_agent_cooperatives IS
  'Coopératives confiées à un agent, avec ses périmètres. Un agent n''agit que là ; owner et manager couvrent tout le portefeuille de l''opérateur. Jamais au-delà du mandat de l''opérateur sur la coopérative.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_coop_active
  ON public.partner_agent_cooperatives(partner_id, user_id, cooperative_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_agent_coop_user ON public.partner_agent_cooperatives(user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.partner_agent_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  phone text,
  membership_role public.partner_membership_role NOT NULL DEFAULT 'agent',
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  accepted_by uuid REFERENCES public.profiles(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_invitations_partner ON public.partner_agent_invitations(partner_id, created_at DESC);

-- Historique des actions et des accès (consultation des producteurs, émission, impression).
CREATE TABLE IF NOT EXISTS public.partner_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  cooperative_id uuid REFERENCES public.cooperatives(id),
  member_id uuid REFERENCES public.members(id),
  member_card_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_partner ON public.partner_activity_log(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON public.partner_activity_log(actor_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_activity_no_update ON public.partner_activity_log;
CREATE TRIGGER trg_activity_no_update BEFORE UPDATE ON public.partner_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
DROP TRIGGER IF EXISTS trg_activity_no_delete ON public.partner_activity_log;
CREATE TRIGGER trg_activity_no_delete BEFORE DELETE ON public.partner_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

-- ── 5. Formation : 15 000 FCFA par personne, en une fois ou en 5 × 3 000 ──────

CREATE TABLE IF NOT EXISTS public.training_fee_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  total_fcfa integer NOT NULL DEFAULT 15000 CHECK (total_fcfa > 0),
  installment_fcfa integer NOT NULL DEFAULT 3000 CHECK (installment_fcfa > 0),
  payer public.training_payer NOT NULL DEFAULT 'self',
  paid_fcfa integer NOT NULL DEFAULT 0,
  status public.training_fee_status NOT NULL DEFAULT 'unpaid',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (paid_fcfa >= 0 AND paid_fcfa <= total_fcfa),
  CHECK (total_fcfa % installment_fcfa = 0)
);

COMMENT ON TABLE public.training_fee_accounts IS
  'Frais de formation d''une personne (opérateur individuel ou agent). Séparés des crédits PAYG : payer la formation ne crédite ni ne débite jamais le portefeuille.';

CREATE TABLE IF NOT EXISTS public.training_fee_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.training_fee_accounts(id) ON DELETE RESTRICT,
  amount_fcfa integer NOT NULL CHECK (amount_fcfa > 0),
  installments integer NOT NULL CHECK (installments > 0),
  method text NOT NULL CHECK (method IN ('fedapay', 'manual', 'certification')),
  payment_intent_id uuid UNIQUE REFERENCES public.partner_payment_intents(id),
  paid_by uuid REFERENCES public.profiles(id),
  reference text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_payments_account ON public.training_fee_payments(account_id, created_at);

DROP TRIGGER IF EXISTS trg_training_payments_no_update ON public.training_fee_payments;
CREATE TRIGGER trg_training_payments_no_update BEFORE UPDATE ON public.training_fee_payments
  FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();
DROP TRIGGER IF EXISTS trg_training_payments_no_delete ON public.training_fee_payments;
CREATE TRIGGER trg_training_payments_no_delete BEFORE DELETE ON public.training_fee_payments
  FOR EACH ROW EXECUTE FUNCTION public.reject_ledger_mutation();

-- ── 6. Impression ────────────────────────────────────────────────────────────

-- Self-print et commandes FaîtièreHub : chaque impression est tracée, aucune n'est facturée.
CREATE TABLE IF NOT EXISTS public.card_print_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_card_id uuid NOT NULL REFERENCES public.member_cards(id),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  actor_id uuid REFERENCES public.profiles(id),
  mode text NOT NULL CHECK (mode IN ('self', 'faitierehub')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_events_partner ON public.card_print_events(partner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.faitierehub_print_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  requested_by uuid REFERENCES public.profiles(id),
  status public.fh_print_order_status NOT NULL DEFAULT 'quote_requested',
  card_format text NOT NULL CHECK (card_format IN ('plastified', 'pvc')),
  delivery_address text NOT NULL,
  delivery_contact text NOT NULL,
  note text,
  -- Devis : fabrication et livraison, toujours distincts de la commission numérique déjà payée.
  fabrication_fcfa integer CHECK (fabrication_fcfa IS NULL OR fabrication_fcfa >= 0),
  delivery_fcfa integer CHECK (delivery_fcfa IS NULL OR delivery_fcfa >= 0),
  quote_note text,
  quoted_by uuid REFERENCES public.profiles(id),
  quoted_at timestamptz,
  payment_intent_id uuid REFERENCES public.partner_payment_intents(id),
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fh_print_orders_partner ON public.faitierehub_print_orders(partner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.faitierehub_print_order_items (
  order_id uuid NOT NULL REFERENCES public.faitierehub_print_orders(id) ON DELETE CASCADE,
  member_card_id uuid NOT NULL REFERENCES public.member_cards(id),
  PRIMARY KEY (order_id, member_card_id)
);

-- ── 7. Protection des données ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.partner_data_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.partner_organization_assignments(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  cooperative_id uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  agreement_version text NOT NULL DEFAULT '2026-10',
  data_access_mandate boolean NOT NULL DEFAULT true,
  producers_informed boolean NOT NULL DEFAULT false,
  photo_policy text NOT NULL DEFAULT 'card_only' CHECK (photo_policy IN ('no_photo', 'card_only')),
  cooperative_signatory text NOT NULL,
  operator_signatory text NOT NULL,
  signed_on date NOT NULL,
  document_reference text,
  recorded_by uuid REFERENCES public.profiles(id),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.partner_data_agreements IS
  'Convention opérateur–coopérative et mandat d''accès aux données des producteurs. Une ligne par signature ; une nouvelle version remplace la précédente (revoked_at).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_agreement_active
  ON public.partner_data_agreements(assignment_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.data_rectification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  requested_via text NOT NULL CHECK (requested_via IN ('agent', 'cooperative', 'producer')),
  description text NOT NULL CHECK (length(description) BETWEEN 5 AND 2000),
  status public.rectification_status NOT NULL DEFAULT 'open',
  resolution text,
  created_by uuid REFERENCES public.profiles(id),
  handled_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_rectification_coop ON public.data_rectification_requests(cooperative_id, status);

-- ── 8. Tarifs et réglages ────────────────────────────────────────────────────

INSERT INTO public.billing_rules (code, label, unit, price_xof, metadata)
SELECT v.code, v.label, v.unit, v.price, v.meta
FROM (VALUES
  ('card_commission', 'Commission numérique FaîtièreHub par carte commerciale', 'carte', 250,
    '{"credits": 1}'::jsonb),
  ('credit_pack_20', 'Pack de 20 crédits', 'pack', 5000, '{"credits": 20}'::jsonb),
  ('credit_pack_40', 'Pack de 40 crédits', 'pack', 10000, '{"credits": 40}'::jsonb),
  ('credit_pack_100', 'Pack de 100 crédits', 'pack', 25000, '{"credits": 100}'::jsonb),
  ('training_fee', 'Formation Opérateur FaîtièreHub', 'personne', 15000,
    '{"installments": 5, "installment_fcfa": 3000}'::jsonb)
) AS v(code, label, unit, price, meta)
WHERE NOT EXISTS (
  SELECT 1 FROM public.billing_rules r WHERE r.code = v.code AND r.active AND r.effective_to IS NULL
);

-- Ancienne carte physique à 2 000 FCFA (500 coopérative / 1 500 partenaire) : close, gardée.
UPDATE public.billing_rules
SET effective_to = now(), updated_at = now()
WHERE code = 'physical_card_fee' AND effective_to IS NULL AND effective_from < now();

INSERT INTO public.platform_settings (key, value) VALUES
  ('payg_welcome_credits', '10'::jsonb),
  ('payg_min_purchase_credits', '20'::jsonb),
  ('payg_require_data_agreement', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── 9. Droits : qui peut agir sur quelle coopérative ──────────────────────────

CREATE SCHEMA IF NOT EXISTS private;

-- L'acteur `p_user` (au titre de l'opérateur `p_partner`, ou de n'importe lequel si NULL)
-- peut-il agir sur `p_coop` avec le périmètre `p_scope` ? Règles de production conservées
-- telles quelles (20260920082108_launch_access_hardening) : adhésion active, opérateur
-- certifié ou actif, certification de CE compte, mandat actif dans sa période, périmètre du
-- mandat. Seule nouveauté : un agent doit en plus s'être vu confier la coopérative, avec le
-- périmètre demandé.
CREATE OR REPLACE FUNCTION private.partner_actor_can(
  p_user uuid, p_partner uuid, p_coop uuid, p_scope public.partner_access_scope
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_organization_assignments a
    JOIN public.partners p ON p.id = a.partner_id
    JOIN public.partner_memberships m ON m.partner_id = p.id
    JOIN public.partner_certifications c ON c.partner_id = p.id AND c.user_id = m.user_id
    WHERE m.user_id = p_user AND m.status = 'active'
      AND (p_partner IS NULL OR p.id = p_partner)
      AND p.status IN ('certified', 'active') AND c.certified_at IS NOT NULL
      AND a.cooperative_id = p_coop AND a.status = 'active'
      AND a.started_at <= now() AND (a.ended_at IS NULL OR a.ended_at > now())
      AND (p_scope IS NULL OR EXISTS (SELECT 1 FROM public.partner_assignment_scopes s
        WHERE s.assignment_id = a.id AND s.scope = p_scope))
      AND (
        m.membership_role IN ('owner', 'manager')
        OR EXISTS (
          SELECT 1 FROM public.partner_agent_cooperatives g
          WHERE g.partner_id = p.id AND g.user_id = m.user_id
            AND g.cooperative_id = p_coop AND g.status = 'active'
            AND (p_scope IS NULL OR p_scope = ANY (g.scopes)))
      )
  );
$$;

REVOKE ALL ON FUNCTION private.partner_actor_can(uuid, uuid, uuid, public.partner_access_scope)
  FROM PUBLIC, anon, authenticated;

-- Même signature et même usage dans les politiques RLS de members et member_cards.
CREATE OR REPLACE FUNCTION public.has_partner_org_access(
  target_coop uuid,
  required_scope public.partner_access_scope DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT private.partner_actor_can((SELECT auth.uid()), NULL, target_coop, required_scope);
$$;

-- Opérateurs dont le compte courant est au moins `p_min` (owner > manager > agent).
CREATE OR REPLACE FUNCTION public.current_partner_ids_with_role(p_min public.partner_membership_role)
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(array_agg(partner_id), ARRAY[]::uuid[])
  FROM public.partner_memberships
  WHERE user_id = auth.uid() AND status = 'active'
    AND (CASE membership_role WHEN 'owner' THEN 2 WHEN 'manager' THEN 1 ELSE 0 END)
        >= (CASE p_min WHEN 'owner' THEN 2 WHEN 'manager' THEN 1 ELSE 0 END);
$$;

REVOKE ALL ON FUNCTION public.current_partner_ids_with_role(public.partner_membership_role)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_partner_ids_with_role(public.partner_membership_role)
  TO authenticated;

CREATE OR REPLACE FUNCTION private.is_super_admin(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user AND role = 'super_admin' AND deleted_at IS NULL
  );
$$;

-- Utilisée dans les politiques RLS ci-dessous, donc exécutable par `authenticated` (même
-- traitement que private.org_admin_access). Le schéma private n'est pas exposé par l'API.
REVOKE ALL ON FUNCTION private.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_super_admin(uuid) TO authenticated, service_role;

-- Une affectation d'agent n'existe que dans le mandat de son opérateur, pour un membre actif.
CREATE OR REPLACE FUNCTION private.check_agent_cooperative()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.partner_memberships
      WHERE partner_id = NEW.partner_id AND user_id = NEW.user_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0020',
        MESSAGE = 'Ce compte n''est pas membre actif de cet opérateur.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.partner_organization_assignments
      WHERE partner_id = NEW.partner_id AND cooperative_id = NEW.cooperative_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0021',
        MESSAGE = 'L''opérateur n''a pas de mandat actif sur cette coopérative.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.check_agent_cooperative() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_check_agent_cooperative ON public.partner_agent_cooperatives;
CREATE TRIGGER trg_check_agent_cooperative
  BEFORE INSERT OR UPDATE ON public.partner_agent_cooperatives
  FOR EACH ROW EXECUTE FUNCTION private.check_agent_cooperative();

-- Un agent retiré perd aussitôt ses coopératives.
CREATE OR REPLACE FUNCTION private.revoke_agent_cooperatives()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status = 'revoked' AND OLD.status = 'active' THEN
    UPDATE public.partner_agent_cooperatives
    SET status = 'revoked', revoked_at = now()
    WHERE partner_id = NEW.partner_id AND user_id = NEW.user_id AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.revoke_agent_cooperatives() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_revoke_agent_cooperatives ON public.partner_memberships;
CREATE TRIGGER trg_revoke_agent_cooperatives
  AFTER UPDATE OF status ON public.partner_memberships
  FOR EACH ROW EXECUTE FUNCTION private.revoke_agent_cooperatives();

-- ── 10. Quota gratuit : une carte payée n'y compte plus ──────────────────────
-- Corps identique à la version en production (dont l'exception de fusion de doublons),
-- plus une seule règle : une carte qui porte une commission consommée est une carte
-- commerciale, hors quota gratuit. Une carte est donc gratuite OU payée, jamais les deux.

CREATE OR REPLACE FUNCTION private.enforce_cooperative_card_allowance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.cooperative_id IS DISTINCT FROM OLD.cooperative_id
      OR NEW.member_id IS DISTINCT FROM OLD.member_id
      OR NEW.card_number IS DISTINCT FROM OLD.card_number
      OR NEW.card_type IS DISTINCT FROM OLD.card_type THEN
      IF current_setting('faitierehub.card_merge', true) = 'on'
        AND NEW.card_number = OLD.card_number
        AND NEW.card_type IS NOT DISTINCT FROM OLD.card_type THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION USING ERRCODE='P0011', MESSAGE='L''identité et l''organisation d''une carte émise ne peuvent pas être modifiées.';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.cooperative_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.card_commissions c
    WHERE c.member_card_id = NEW.id AND c.status = 'consumed'
  ) THEN
    RETURN NEW;
  END IF;
  INSERT INTO private.cooperative_card_allowances(cooperative_id)
    VALUES(NEW.cooperative_id) ON CONFLICT(cooperative_id) DO NOTHING;
  UPDATE private.cooperative_card_allowances
    SET cards_issued=cards_issued+1, updated_at=now()
    WHERE cooperative_id=NEW.cooperative_id AND cards_issued<card_limit;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0010', MESSAGE='Les 10 cartes numériques gratuites de cette coopérative sont utilisées. Émettez une carte commerciale (1 crédit) depuis la console opérateur.';
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION private.enforce_cooperative_card_allowance() FROM PUBLIC, anon, authenticated, service_role;

-- ── 11. Fonctions financières (service_role uniquement) ─────────────────────

CREATE OR REPLACE FUNCTION private.setting_int(p_key text, p_default integer)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN jsonb_typeof(value) = 'number' THEN (value)::text::integer END
     FROM public.platform_settings WHERE key = p_key),
    p_default);
$$;

REVOKE ALL ON FUNCTION private.setting_int(text, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.card_commission_rule()
RETURNS public.billing_rules
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT r.* FROM public.billing_rules r
  WHERE r.code = 'card_commission' AND r.active
    AND r.effective_from <= now() AND (r.effective_to IS NULL OR r.effective_to > now())
  ORDER BY r.effective_from DESC LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.card_commission_rule() FROM PUBLIC, anon, authenticated;

-- 10 crédits offerts, une seule fois par opérateur (institution comprise, jamais par agent).
CREATE OR REPLACE FUNCTION public.payg_grant_welcome_credits(p_partner_id uuid, p_actor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_wallet public.partner_wallets%ROWTYPE;
  v_credits integer := private.setting_int('payg_welcome_credits', 10);
  v_balance integer;
BEGIN
  SELECT * INTO v_wallet FROM public.partner_wallets WHERE partner_id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'no_wallet'); END IF;
  IF v_wallet.welcome_granted_at IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'already_granted', 'credit_balance', v_wallet.credit_balance);
  END IF;
  IF v_credits <= 0 THEN
    UPDATE public.partner_wallets SET welcome_granted_at = now() WHERE id = v_wallet.id;
    RETURN jsonb_build_object('outcome', 'none_configured', 'credit_balance', v_wallet.credit_balance);
  END IF;
  UPDATE public.partner_wallets
  SET credit_balance = credit_balance + v_credits,
      welcome_credits = welcome_credits + v_credits,
      welcome_granted_at = now(), updated_at = now()
  WHERE id = v_wallet.id
  RETURNING credit_balance INTO v_balance;
  INSERT INTO public.payg_credit_ledger
    (partner_id, entry_type, credits, welcome_delta, balance_after, actor_id, idempotency_key, note)
  VALUES
    (p_partner_id, 'WELCOME', v_credits, v_credits, v_balance, p_actor,
     'welcome:' || p_partner_id, 'Commissions offertes à l''ouverture');
  INSERT INTO public.partner_activity_log (partner_id, actor_id, action, details)
  VALUES (p_partner_id, p_actor, 'credits.welcome', jsonb_build_object('credits', v_credits));
  RETURN jsonb_build_object('outcome', 'granted', 'credits', v_credits, 'credit_balance', v_balance);
END;
$$;

-- Achat de crédits : au moins le minimum (20), au prix de la commission en vigueur.
CREATE OR REPLACE FUNCTION public.payg_purchase_credits(
  p_partner_id uuid,
  p_credits integer,
  p_amount_fcfa integer,
  p_idempotency_key text,
  p_payment_intent_id uuid DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_existing public.payg_credit_ledger%ROWTYPE;
  v_wallet public.partner_wallets%ROWTYPE;
  v_rule public.billing_rules%ROWTYPE;
  v_min integer := private.setting_int('payg_min_purchase_credits', 20);
  v_balance integer;
  v_ledger uuid;
  v_purchases integer;
BEGIN
  SELECT * INTO v_existing FROM public.payg_credit_ledger WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome', 'already_applied', 'ledger_id', v_existing.id,
      'credit_balance', v_existing.balance_after);
  END IF;
  IF p_credits IS NULL OR p_credits < v_min THEN
    RETURN jsonb_build_object('outcome', 'below_minimum', 'minimum', v_min);
  END IF;
  v_rule := private.card_commission_rule();
  IF v_rule.id IS NULL THEN RETURN jsonb_build_object('outcome', 'no_active_rule'); END IF;
  IF p_amount_fcfa IS DISTINCT FROM p_credits * v_rule.price_xof THEN
    RETURN jsonb_build_object('outcome', 'amount_mismatch',
      'expected_fcfa', p_credits * v_rule.price_xof);
  END IF;
  SELECT * INTO v_wallet FROM public.partner_wallets WHERE partner_id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'no_wallet'); END IF;
  UPDATE public.partner_wallets
  SET credit_balance = credit_balance + p_credits, updated_at = now()
  WHERE id = v_wallet.id
  RETURNING credit_balance INTO v_balance;
  INSERT INTO public.payg_credit_ledger
    (partner_id, entry_type, credits, balance_after, amount_fcfa, payment_intent_id, actor_id,
     idempotency_key, note)
  VALUES
    (p_partner_id, 'PURCHASE', p_credits, v_balance, p_amount_fcfa, p_payment_intent_id, p_actor,
     p_idempotency_key, p_note)
  RETURNING id INTO v_ledger;
  SELECT count(*) INTO v_purchases FROM public.payg_credit_ledger
  WHERE partner_id = p_partner_id AND entry_type = 'PURCHASE';
  INSERT INTO public.partner_activity_log (partner_id, actor_id, action, details)
  VALUES (p_partner_id, p_actor, 'credits.purchased',
    jsonb_build_object('credits', p_credits, 'amount_fcfa', p_amount_fcfa, 'purchase_rank', v_purchases));
  RETURN jsonb_build_object('outcome', 'applied', 'ledger_id', v_ledger, 'credit_balance', v_balance,
    'purchase_rank', v_purchases);
END;
$$;

-- Correction par un super_admin (note obligatoire). Ne rend jamais le solde négatif.
CREATE OR REPLACE FUNCTION public.payg_adjust_credits(
  p_partner_id uuid, p_credits integer, p_idempotency_key text, p_actor uuid, p_note text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_wallet public.partner_wallets%ROWTYPE;
  v_balance integer;
  v_welcome integer;
BEGIN
  IF NOT private.is_super_admin(p_actor) THEN RETURN jsonb_build_object('outcome', 'forbidden'); END IF;
  IF p_credits IS NULL OR p_credits = 0 OR coalesce(length(trim(p_note)), 0) < 3 THEN
    RETURN jsonb_build_object('outcome', 'invalid');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payg_credit_ledger WHERE idempotency_key = p_idempotency_key) THEN
    RETURN jsonb_build_object('outcome', 'already_applied');
  END IF;
  SELECT * INTO v_wallet FROM public.partner_wallets WHERE partner_id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'no_wallet'); END IF;
  IF v_wallet.credit_balance + p_credits < 0 THEN
    RETURN jsonb_build_object('outcome', 'insufficient_credits', 'credit_balance', v_wallet.credit_balance);
  END IF;
  v_balance := v_wallet.credit_balance + p_credits;
  v_welcome := least(v_wallet.welcome_credits, v_balance);
  UPDATE public.partner_wallets
  SET credit_balance = v_balance, welcome_credits = v_welcome, updated_at = now()
  WHERE id = v_wallet.id;
  INSERT INTO public.payg_credit_ledger
    (partner_id, entry_type, credits, welcome_delta, balance_after, actor_id, idempotency_key, note)
  VALUES
    (p_partner_id, 'ADJUSTMENT', p_credits, v_welcome - v_wallet.welcome_credits, v_balance, p_actor,
     p_idempotency_key, p_note);
  RETURN jsonb_build_object('outcome', 'applied', 'credit_balance', v_balance);
END;
$$;

-- Émission d'une carte. Tout dans une transaction : si la carte ne peut pas être créée,
-- aucun crédit n'est consommé. Une carte ne porte jamais deux commissions.
CREATE OR REPLACE FUNCTION public.payg_issue_member_card(
  p_actor uuid,
  p_partner_id uuid,
  p_member_id uuid,
  p_mode text,
  p_card_number text,
  p_expiry_date date,
  p_card_format text,
  p_producer_price_fcfa integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_request public.card_issuance_requests%ROWTYPE;
  v_member record;
  v_partner public.partners%ROWTYPE;
  v_wallet public.partner_wallets%ROWTYPE;
  v_rule public.billing_rules%ROWTYPE;
  v_card_id uuid := gen_random_uuid();
  v_source public.card_commission_source;
  v_balance integer;
  v_ledger uuid;
  v_constraint text;
BEGIN
  IF p_mode NOT IN ('commercial', 'free_allowance') THEN
    RETURN jsonb_build_object('outcome', 'invalid_mode');
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RETURN jsonb_build_object('outcome', 'invalid_key');
  END IF;
  IF p_card_format NOT IN ('digital', 'plastified', 'pvc') THEN
    RETURN jsonb_build_object('outcome', 'invalid_format');
  END IF;

  -- Une émission à la fois par producteur : deux clics simultanés se suivent.
  PERFORM pg_advisory_xact_lock(hashtextextended('payg-card:' || p_member_id::text, 0));

  SELECT * INTO v_request FROM public.card_issuance_requests WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_request.partner_id <> p_partner_id OR v_request.member_id <> p_member_id THEN
      RETURN jsonb_build_object('outcome', 'key_reused');
    END IF;
    RETURN jsonb_build_object(
      'outcome', 'already_issued',
      'member_card_id', v_request.member_card_id,
      'card_number', (SELECT card_number FROM public.member_cards WHERE id = v_request.member_card_id),
      'mode', v_request.mode,
      'credit_balance', (SELECT credit_balance FROM public.partner_wallets WHERE partner_id = p_partner_id));
  END IF;

  SELECT id, cooperative_id INTO v_member FROM public.members
  WHERE id = p_member_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'member_not_found'); END IF;

  SELECT * INTO v_partner FROM public.partners WHERE id = p_partner_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'partner_not_found'); END IF;
  IF v_partner.status <> 'active' THEN RETURN jsonb_build_object('outcome', 'partner_not_active'); END IF;

  IF NOT private.partner_actor_can(p_actor, p_partner_id, v_member.cooperative_id, 'cards.manage') THEN
    RETURN jsonb_build_object('outcome', 'forbidden');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.member_cards
    WHERE member_id = p_member_id AND status = 'active' AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('outcome', 'already_has_card');
  END IF;

  BEGIN
    IF p_mode = 'commercial' THEN
      v_rule := private.card_commission_rule();
      IF v_rule.id IS NULL THEN RETURN jsonb_build_object('outcome', 'no_active_rule'); END IF;
      SELECT * INTO v_wallet FROM public.partner_wallets WHERE partner_id = p_partner_id FOR UPDATE;
      IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'no_wallet'); END IF;
      IF v_wallet.credit_balance < 1 THEN
        RETURN jsonb_build_object('outcome', 'insufficient_credits', 'credit_balance', v_wallet.credit_balance);
      END IF;
      v_source := CASE WHEN v_wallet.welcome_credits > 0 THEN 'welcome' ELSE 'purchased' END;
      UPDATE public.partner_wallets
      SET credit_balance = credit_balance - 1,
          welcome_credits = welcome_credits - (CASE WHEN v_source = 'welcome' THEN 1 ELSE 0 END),
          updated_at = now()
      WHERE id = v_wallet.id
      RETURNING credit_balance INTO v_balance;
      INSERT INTO public.payg_credit_ledger
        (partner_id, entry_type, credits, welcome_delta, balance_after, amount_fcfa, member_card_id,
         cooperative_id, actor_id, idempotency_key)
      VALUES
        (p_partner_id, 'CONSUME', -1, CASE WHEN v_source = 'welcome' THEN -1 ELSE 0 END, v_balance,
         v_rule.price_xof, v_card_id, v_member.cooperative_id, p_actor, 'card:' || p_idempotency_key)
      RETURNING id INTO v_ledger;
      INSERT INTO public.card_commissions
        (member_card_id, partner_id, cooperative_id, member_id, issued_by, source, commission_fcfa,
         billing_rule_id, card_format, producer_price_fcfa, consume_ledger_id)
      VALUES
        (v_card_id, p_partner_id, v_member.cooperative_id, p_member_id, p_actor, v_source,
         v_rule.price_xof, v_rule.id, p_card_format, p_producer_price_fcfa, v_ledger);
    END IF;

    INSERT INTO public.member_cards (id, cooperative_id, member_id, card_number, status, expiry_date, card_type)
    VALUES (v_card_id, v_member.cooperative_id, p_member_id, p_card_number, 'active', p_expiry_date, 'FAITIERE');

    INSERT INTO public.card_issuance_requests (idempotency_key, partner_id, member_id, member_card_id, mode, actor_id)
    VALUES (p_idempotency_key, p_partner_id, p_member_id, v_card_id, p_mode, p_actor);

    INSERT INTO public.partner_activity_log
      (partner_id, actor_id, action, cooperative_id, member_id, member_card_id, details)
    VALUES
      (p_partner_id, p_actor, 'card.issued', v_member.cooperative_id, p_member_id, v_card_id,
       jsonb_build_object('mode', p_mode, 'source', v_source, 'card_format', p_card_format,
         'card_number', p_card_number));
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      RETURN jsonb_build_object('outcome',
        CASE
          WHEN v_constraint = 'member_cards_card_number_key' THEN 'card_number_taken'
          WHEN v_constraint = 'idx_member_cards_active_member' THEN 'already_has_card'
          ELSE 'conflict'
        END);
    WHEN SQLSTATE 'P0010' THEN
      RETURN jsonb_build_object('outcome', 'free_allowance_exhausted');
  END;

  RETURN jsonb_build_object(
    'outcome', 'issued',
    'member_card_id', v_card_id,
    'card_number', p_card_number,
    'mode', p_mode,
    'source', v_source,
    'credit_balance', CASE WHEN p_mode = 'commercial' THEN v_balance
      ELSE (SELECT credit_balance FROM public.partner_wallets WHERE partner_id = p_partner_id) END);
END;
$$;

-- Carte émise par erreur : un super_admin la révoque et rend le crédit, une seule fois.
CREATE OR REPLACE FUNCTION public.payg_release_card_commission(
  p_member_card_id uuid, p_actor uuid, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_commission public.card_commissions%ROWTYPE;
  v_balance integer;
  v_ledger uuid;
BEGIN
  IF NOT private.is_super_admin(p_actor) THEN RETURN jsonb_build_object('outcome', 'forbidden'); END IF;
  IF coalesce(length(trim(p_reason)), 0) < 3 THEN RETURN jsonb_build_object('outcome', 'invalid'); END IF;
  SELECT * INTO v_commission FROM public.card_commissions WHERE member_card_id = p_member_card_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'no_commission'); END IF;
  IF v_commission.status = 'released' THEN RETURN jsonb_build_object('outcome', 'already_released'); END IF;
  PERFORM 1 FROM public.partner_wallets WHERE partner_id = v_commission.partner_id FOR UPDATE;
  UPDATE public.partner_wallets
  SET credit_balance = credit_balance + 1,
      welcome_credits = welcome_credits + (CASE WHEN v_commission.source = 'welcome' THEN 1 ELSE 0 END),
      updated_at = now()
  WHERE partner_id = v_commission.partner_id
  RETURNING credit_balance INTO v_balance;
  INSERT INTO public.payg_credit_ledger
    (partner_id, entry_type, credits, welcome_delta, balance_after, amount_fcfa, member_card_id,
     cooperative_id, actor_id, idempotency_key, note)
  VALUES
    (v_commission.partner_id, 'RELEASE', 1, CASE WHEN v_commission.source = 'welcome' THEN 1 ELSE 0 END,
     v_balance, v_commission.commission_fcfa, p_member_card_id, v_commission.cooperative_id, p_actor,
     'release:' || p_member_card_id, p_reason)
  RETURNING id INTO v_ledger;
  UPDATE public.card_commissions
  SET status = 'released', release_ledger_id = v_ledger, release_reason = p_reason, released_at = now()
  WHERE id = v_commission.id;
  UPDATE public.member_cards
  SET status = 'revoked', revoked_at = now(), revoked_reason = p_reason, updated_at = now()
  WHERE id = p_member_card_id;
  INSERT INTO public.partner_activity_log
    (partner_id, actor_id, action, cooperative_id, member_id, member_card_id, details)
  VALUES
    (v_commission.partner_id, p_actor, 'card.released', v_commission.cooperative_id,
     v_commission.member_id, p_member_card_id, jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('outcome', 'released', 'credit_balance', v_balance);
END;
$$;

-- Paiement de formation : un multiple de la tranche (3 000), jamais plus que le reste dû.
CREATE OR REPLACE FUNCTION public.payg_record_training_payment(
  p_account_id uuid,
  p_amount_fcfa integer,
  p_method text,
  p_idempotency_key text,
  p_payment_intent_id uuid DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_existing public.training_fee_payments%ROWTYPE;
  v_account public.training_fee_accounts%ROWTYPE;
  v_remaining integer;
  v_paid integer;
  v_status public.training_fee_status;
BEGIN
  SELECT * INTO v_existing FROM public.training_fee_payments WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    SELECT * INTO v_account FROM public.training_fee_accounts WHERE id = v_existing.account_id;
    RETURN jsonb_build_object('outcome', 'already_applied', 'paid_fcfa', v_account.paid_fcfa,
      'status', v_account.status);
  END IF;
  IF p_method NOT IN ('fedapay', 'manual', 'certification') THEN
    RETURN jsonb_build_object('outcome', 'invalid_method');
  END IF;
  SELECT * INTO v_account FROM public.training_fee_accounts WHERE id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'no_account'); END IF;
  v_remaining := v_account.total_fcfa - v_account.paid_fcfa;
  IF v_account.status IN ('paid', 'waived') OR v_remaining = 0 THEN
    RETURN jsonb_build_object('outcome', 'already_paid', 'paid_fcfa', v_account.paid_fcfa);
  END IF;
  IF p_amount_fcfa IS NULL OR p_amount_fcfa <= 0 OR p_amount_fcfa > v_remaining
     OR p_amount_fcfa % v_account.installment_fcfa <> 0 THEN
    RETURN jsonb_build_object('outcome', 'invalid_amount', 'remaining_fcfa', v_remaining,
      'installment_fcfa', v_account.installment_fcfa);
  END IF;
  v_paid := v_account.paid_fcfa + p_amount_fcfa;
  v_status := CASE WHEN v_paid = v_account.total_fcfa THEN 'paid' ELSE 'partial' END;
  INSERT INTO public.training_fee_payments
    (account_id, amount_fcfa, installments, method, payment_intent_id, paid_by, reference, idempotency_key)
  VALUES
    (p_account_id, p_amount_fcfa, p_amount_fcfa / v_account.installment_fcfa, p_method,
     p_payment_intent_id, p_actor, p_reference, p_idempotency_key);
  UPDATE public.training_fee_accounts
  SET paid_fcfa = v_paid, status = v_status,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE paid_at END, updated_at = now()
  WHERE id = p_account_id;
  IF v_account.partner_id IS NOT NULL THEN
    INSERT INTO public.partner_activity_log (partner_id, actor_id, action, details)
    VALUES (v_account.partner_id, p_actor, 'training.paid',
      jsonb_build_object('account_id', p_account_id, 'trainee', v_account.user_id,
        'amount_fcfa', p_amount_fcfa, 'paid_fcfa', v_paid, 'status', v_status));
  END IF;
  RETURN jsonb_build_object('outcome', 'applied', 'paid_fcfa', v_paid,
    'remaining_fcfa', v_account.total_fcfa - v_paid, 'status', v_status);
END;
$$;

-- Indicateurs super-admin, calculés depuis les grands livres (aucune donnée inventée).
CREATE OR REPLACE FUNCTION public.payg_admin_overview()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH buyers AS (
    SELECT partner_id, count(*) AS purchases
    FROM public.payg_credit_ledger WHERE entry_type = 'PURCHASE' GROUP BY partner_id
  ),
  active_partners AS (
    SELECT id, operator_kind FROM public.partners WHERE status = 'active'
  )
  SELECT jsonb_build_object(
    'operators', jsonb_build_object(
      'individual_active', (SELECT count(*) FROM active_partners WHERE operator_kind = 'individual'),
      'institutional_active', (SELECT count(*) FROM active_partners WHERE operator_kind = 'institutional'),
      'candidates', (SELECT count(*) FROM public.partners WHERE status IN ('candidate', 'training', 'exam_pending'))
    ),
    'agents_by_institution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('partner_id', p.id, 'name', p.display_name,
        'agents', (SELECT count(*) FROM public.partner_memberships m
                   WHERE m.partner_id = p.id AND m.status = 'active' AND m.membership_role = 'agent'))
        ORDER BY p.display_name)
      FROM public.partners p WHERE p.operator_kind = 'institutional'), '[]'::jsonb),
    'credits', jsonb_build_object(
      'purchased', COALESCE((SELECT sum(credits) FROM public.payg_credit_ledger WHERE entry_type = 'PURCHASE'), 0),
      'purchased_fcfa', COALESCE((SELECT sum(amount_fcfa) FROM public.payg_credit_ledger WHERE entry_type = 'PURCHASE'), 0),
      'welcome_granted', COALESCE((SELECT sum(credits) FROM public.payg_credit_ledger WHERE entry_type = 'WELCOME'), 0),
      'consumed', (SELECT count(*) FROM public.card_commissions WHERE status = 'consumed'),
      'consumed_welcome', (SELECT count(*) FROM public.card_commissions WHERE status = 'consumed' AND source = 'welcome'),
      'consumed_purchased', (SELECT count(*) FROM public.card_commissions WHERE status = 'consumed' AND source = 'purchased'),
      'outstanding', COALESCE((SELECT sum(credit_balance) FROM public.partner_wallets), 0)
    ),
    'commissions_earned_fcfa', COALESCE((SELECT sum(commission_fcfa) FROM public.card_commissions
      WHERE status = 'consumed' AND source = 'purchased'), 0),
    'training', jsonb_build_object(
      'paid', (SELECT count(*) FROM public.training_fee_accounts WHERE status = 'paid'),
      'partial', (SELECT count(*) FROM public.training_fee_accounts WHERE status = 'partial'),
      'unpaid', (SELECT count(*) FROM public.training_fee_accounts WHERE status = 'unpaid'),
      'collected_fcfa', COALESCE((SELECT sum(amount_fcfa) FROM public.training_fee_payments), 0),
      'due_fcfa', COALESCE((SELECT sum(total_fcfa - paid_fcfa) FROM public.training_fee_accounts
        WHERE status IN ('unpaid', 'partial')), 0)
    ),
    'recharge', jsonb_build_object(
      'active_operators', (SELECT count(*) FROM active_partners),
      'first', (SELECT count(*) FROM buyers b JOIN active_partners a ON a.id = b.partner_id WHERE b.purchases >= 1),
      'second', (SELECT count(*) FROM buyers b JOIN active_partners a ON a.id = b.partner_id WHERE b.purchases >= 2)
    ),
    'by_region', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('region', region, 'cards', cards) ORDER BY cards DESC)
      FROM (SELECT COALESCE(NULLIF(m.region, ''), 'Non renseignée') AS region, count(*) AS cards
            FROM public.card_commissions c JOIN public.members m ON m.id = c.member_id
            WHERE c.status = 'consumed' GROUP BY 1) r), '[]'::jsonb),
    'by_organization', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('cooperative', name, 'operator', operator, 'cards', cards) ORDER BY cards DESC)
      FROM (SELECT co.name, p.display_name AS operator, count(*) AS cards
            FROM public.card_commissions c
            JOIN public.cooperatives co ON co.id = c.cooperative_id
            JOIN public.partners p ON p.id = c.partner_id
            WHERE c.status = 'consumed' GROUP BY co.name, p.display_name
            ORDER BY count(*) DESC LIMIT 50) o), '[]'::jsonb)
  );
$$;

-- Cartes numériques gratuites restantes par coopérative (le compteur vit dans `private`).
CREATE OR REPLACE FUNCTION public.payg_free_card_allowance(p_cooperative_ids uuid[])
RETURNS TABLE (cooperative_id uuid, card_limit integer, cards_issued integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT c.id, COALESCE(a.card_limit, 10), COALESCE(a.cards_issued, 0)
  FROM unnest(p_cooperative_ids) AS c(id)
  LEFT JOIN private.cooperative_card_allowances a ON a.cooperative_id = c.id;
$$;

DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    'public.payg_free_card_allowance(uuid[])',
    'public.payg_grant_welcome_credits(uuid, uuid)',
    'public.payg_purchase_credits(uuid, integer, integer, text, uuid, uuid, text)',
    'public.payg_adjust_credits(uuid, integer, text, uuid, text)',
    'public.payg_issue_member_card(uuid, uuid, uuid, text, text, date, text, integer, text)',
    'public.payg_release_card_commission(uuid, uuid, text)',
    'public.payg_record_training_payment(uuid, integer, text, text, uuid, uuid, text)',
    'public.payg_admin_overview()'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
  END LOOP;
END $$;

-- ── 12. RLS : lecture seule, écriture par les fonctions et le service_role ──

ALTER TABLE public.payg_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_issuance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_agent_cooperatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_agent_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_fee_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_print_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faitierehub_print_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faitierehub_print_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_data_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_rectification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payg_ledger_read ON public.payg_credit_ledger;
CREATE POLICY payg_ledger_read ON public.payg_credit_ledger FOR SELECT TO authenticated
  USING (
    partner_id = ANY (public.current_partner_ids_with_role('manager'))
    OR (actor_id = (SELECT auth.uid()) AND partner_id = ANY (public.current_partner_ids()))
    OR private.is_super_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS card_commissions_read ON public.card_commissions;
CREATE POLICY card_commissions_read ON public.card_commissions FOR SELECT TO authenticated
  USING (
    partner_id = ANY (public.current_partner_ids_with_role('manager'))
    OR (issued_by = (SELECT auth.uid()) AND partner_id = ANY (public.current_partner_ids()))
    OR private.is_super_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS agent_coops_read ON public.partner_agent_cooperatives;
CREATE POLICY agent_coops_read ON public.partner_agent_cooperatives FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR partner_id = ANY (public.current_partner_ids_with_role('manager'))
    OR private.is_super_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS agent_invitations_read ON public.partner_agent_invitations;
CREATE POLICY agent_invitations_read ON public.partner_agent_invitations FOR SELECT TO authenticated
  USING (
    partner_id = ANY (public.current_partner_ids_with_role('manager'))
    OR private.is_super_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS activity_read ON public.partner_activity_log;
CREATE POLICY activity_read ON public.partner_activity_log FOR SELECT TO authenticated
  USING (
    partner_id = ANY (public.current_partner_ids_with_role('manager'))
    OR (actor_id = (SELECT auth.uid()) AND partner_id = ANY (public.current_partner_ids()))
    OR private.is_super_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS training_accounts_read ON public.training_fee_accounts;
CREATE POLICY training_accounts_read ON public.training_fee_accounts FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR partner_id = ANY (public.current_partner_ids_with_role('manager'))
    OR private.is_super_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS training_payments_read ON public.training_fee_payments;
CREATE POLICY training_payments_read ON public.training_fee_payments FOR SELECT TO authenticated
  USING (
    account_id IN (
      SELECT id FROM public.training_fee_accounts
      WHERE user_id = (SELECT auth.uid())
         OR partner_id = ANY (public.current_partner_ids_with_role('manager')))
    OR private.is_super_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS print_events_read ON public.card_print_events;
CREATE POLICY print_events_read ON public.card_print_events FOR SELECT TO authenticated
  USING (
    partner_id = ANY (public.current_partner_ids_with_role('manager'))
    OR (actor_id = (SELECT auth.uid()) AND partner_id = ANY (public.current_partner_ids()))
    OR private.is_super_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS fh_print_orders_read ON public.faitierehub_print_orders;
CREATE POLICY fh_print_orders_read ON public.faitierehub_print_orders FOR SELECT TO authenticated
  USING (
    partner_id = ANY (public.current_partner_ids_with_role('manager'))
    OR (requested_by = (SELECT auth.uid()) AND partner_id = ANY (public.current_partner_ids()))
    OR private.is_super_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS fh_print_items_read ON public.faitierehub_print_order_items;
CREATE POLICY fh_print_items_read ON public.faitierehub_print_order_items FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT id FROM public.faitierehub_print_orders
      WHERE partner_id = ANY (public.current_partner_ids_with_role('manager'))
         OR (requested_by = (SELECT auth.uid()) AND partner_id = ANY (public.current_partner_ids())))
    OR private.is_super_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS data_agreements_read ON public.partner_data_agreements;
CREATE POLICY data_agreements_read ON public.partner_data_agreements FOR SELECT TO authenticated
  USING (
    partner_id = ANY (public.current_partner_ids())
    OR cooperative_id = ANY (public.get_accessible_cooperative_ids())
    OR private.is_super_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS rectification_read ON public.data_rectification_requests;
CREATE POLICY rectification_read ON public.data_rectification_requests FOR SELECT TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR cooperative_id = ANY (public.get_accessible_cooperative_ids())
    OR partner_id = ANY (public.current_partner_ids_with_role('manager'))
    OR private.is_super_admin((SELECT auth.uid()))
  );

-- ── 13. Données existantes ───────────────────────────────────────────────────

-- Opérateurs déjà actifs : leurs 10 crédits offerts (aucun en production aujourd'hui).
SELECT public.payg_grant_welcome_credits(p.id, NULL)
FROM public.partners p
WHERE p.status = 'active';

-- Un compte de formation par dossier existant. Un dossier déjà certifié a réglé ses frais
-- (ancien circuit) : son compte est soldé, sans paiement inventé.
INSERT INTO public.training_fee_accounts (user_id, partner_id, payer, paid_fcfa, status, paid_at)
SELECT c.user_id, c.partner_id, 'self',
       CASE WHEN c.certified_at IS NOT NULL THEN 15000 ELSE 0 END,
       CASE WHEN c.certified_at IS NOT NULL THEN 'paid'::public.training_fee_status ELSE 'unpaid' END,
       c.certified_at
FROM public.partner_certifications c
ON CONFLICT (user_id) DO NOTHING;
