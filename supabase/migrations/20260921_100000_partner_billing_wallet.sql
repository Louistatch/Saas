-- ─────────────────────────────────────────────────────────────────────────────
-- Facturation Opérateur — portefeuille PAYG (PR 2 du plan à 4 PR)
--
-- PR 1 a posé l'entité Partenaire sans aucune capacité financière (§ du plan :
-- « No wallet yet »). Ce fichier ajoute le domaine de facturation, strictement
-- séparé du domaine cotisations existant.
--
-- ── Pourquoi ne pas réutiliser `payments` ────────────────────────────────
-- `public.payments` impose `cooperative_id NOT NULL` et son callback
-- (app/api/payments/cinetpay-callback/route.ts) est câblé sur les
-- cotisations : il relit `cotisation_id`, écrit dans `cotisations`, notifie
-- la coopérative. Un rechargement de portefeuille ou un paiement de
-- certification n'a ni coopérative, ni cotisation, ni forcément de membre —
-- un Partenaire candidat sans organisation doit pouvoir payer sa
-- certification. Plier `payments` à ce cas aurait exigé de rendre
-- `cooperative_id` nullable (fragilisant tout le reste du dépôt qui suppose
-- le contraire) et de truffer le callback de branches `if (purpose === …)`.
-- Domaine séparé à la place : `partner_payment_intents`, qui réutilise le
-- SEUL morceau générique du système existant — le fournisseur CinetPay
-- (lib/payments/cinetpay.ts), pas son schéma de données.
--
-- ── Six tables suggérées par le plan, quatre retenues ────────────────────
-- `partner_plans` et `partner_subscriptions` sont volontairement absentes :
-- le plan lui-même les réserve à plus tard (§35 : « prepare for… but do NOT
-- hardcode ») et la portée de ce PR ne les liste pas. Les créer maintenant,
-- sans modèle de plan arrêté, serait exactement ce que le plan interdit
-- ailleurs : créer les six tables suggérées sans justifier chacune.
--
-- ── Argent en entier, jamais en flottant (§29 du plan) ───────────────────
-- Toutes les nouvelles colonnes monétaires sont `integer` (FCFA n'a pas de
-- sous-unité). `payments.amount_fcfa` reste en `numeric` : il n'est pas
-- touché par cette migration.
--
-- ── Le portefeuille est un solde CACHÉ, jamais la source de vérité (§30) ──
-- `partner_wallets.balance_fcfa` n'existe que pour un affichage instantané
-- sans agréger le grand livre à chaque lecture. La vérité est
-- `partner_wallet_ledger`, en ajout seul (§31 : jamais de suppression d'une
-- écriture réglée — corriger par une écriture `REVERSAL`).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE partner_ledger_entry_type AS ENUM (
  'CREDIT', 'DEBIT', 'REFUND', 'REVERSAL', 'ADJUSTMENT', 'BONUS'
);

-- 'operator_subscription' est posée maintenant (§38 du plan la nomme comme
-- futur possible) mais aucun chemin de code n'émet encore ce motif — il n'y
-- a pas d'abonnement Opérateur tant que partner_plans/partner_subscriptions
-- n'existent pas.
CREATE TYPE partner_payment_purpose AS ENUM (
  'wallet_topup', 'certification', 'operator_subscription'
);

CREATE TYPE partner_payment_intent_status AS ENUM (
  'pending', 'processing', 'success', 'failed', 'cancelled', 'expired'
);

-- ── billing_rules ────────────────────────────────────────────────────────
-- Les prix vivent ici, pas dans les fichiers React (§34, explicite dans le
-- plan). Versionnée par ligne plutôt que mutable en place : `usage_events`
-- référence l'id exact de la règle qui s'est appliquée, donc changer un prix
-- demain ne réécrit jamais silencieusement le coût d'un événement passé.

CREATE TABLE billing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  unit text NOT NULL,
  price_xof integer NOT NULL CHECK (price_xof >= 0),
  active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

COMMENT ON TABLE billing_rules IS
  'Catalogue des tarifs PAYG, versionné par ligne. Ne jamais UPDATE price_xof sur une ligne déjà référencée par un usage_events : clore la ligne (effective_to = now()) et en insérer une nouvelle.';

-- Au plus une ligne active par code à un instant donné — sinon quel prix
-- s'applique devient ambigu.
CREATE UNIQUE INDEX idx_billing_rules_active_code
  ON billing_rules(code) WHERE active AND effective_to IS NULL;

-- Seule règle tarifaire nécessaire à ce PR : la certification (§9 du plan).
-- Les tarifs de la carte physique (§43-44) arrivent avec PR 3.
INSERT INTO billing_rules (code, label, unit, price_xof, metadata) VALUES
  ('certification_fee', 'Certification Opérateur FaîtiereHub', 'forfait', 15000, '{}'::jsonb);

-- ── partners.wallet ──────────────────────────────────────────────────────
-- Un Partenaire porte un portefeuille dès sa création, qu'il choisisse PAYG
-- ou non plus tard (§35) : un portefeuille à 0 FCFA pour un Partenaire qui
-- n'en a pas l'usage est inoffensif, et évite un chemin de code séparé
-- « créer le portefeuille à la demande » qui pourrait être oublié par un
-- futur appelant.

CREATE TABLE partner_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL UNIQUE REFERENCES partners(id) ON DELETE CASCADE,
  balance_fcfa integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE partner_wallets IS
  'Solde CACHÉ pour affichage rapide. La source de vérité est partner_wallet_ledger — ne jamais écrire balance_fcfa depuis autre chose que debit_partner_wallet()/credit_partner_wallet(), qui le recalculent sous verrou de ligne.';

CREATE OR REPLACE FUNCTION create_partner_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  INSERT INTO partner_wallets (partner_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_partner_wallet
  AFTER INSERT ON partners
  FOR EACH ROW EXECUTE FUNCTION create_partner_wallet();

-- ── partner_wallet_ledger ────────────────────────────────────────────────
-- Le grand livre, en ajout seul. `amount_fcfa` est le delta SIGNÉ réellement
-- appliqué au solde (positif pour CREDIT/BONUS/REFUND, négatif pour DEBIT) ;
-- `balance_after` fige l'état du solde immédiatement après cette écriture,
-- pour qu'un relevé s'affiche sans recalculer une somme cumulative à chaque
-- lecture.

CREATE TABLE partner_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES partner_wallets(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  entry_type partner_ledger_entry_type NOT NULL,
  amount_fcfa integer NOT NULL,
  balance_after integer NOT NULL,
  usage_event_id uuid,       -- posé après création de usage_events (FK ajoutée plus bas)
  payment_intent_id uuid,    -- posé après création de partner_payment_intents (FK ajoutée plus bas)
  reversed_ledger_id uuid REFERENCES partner_wallet_ledger(id),
  idempotency_key text NOT NULL UNIQUE,
  note text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (entry_type IN ('CREDIT', 'REFUND', 'BONUS') AND amount_fcfa > 0) OR
    (entry_type = 'DEBIT' AND amount_fcfa < 0) OR
    (entry_type IN ('REVERSAL', 'ADJUSTMENT'))  -- sens libre : une correction peut aller dans les deux sens
  )
);

COMMENT ON TABLE partner_wallet_ledger IS
  'Historique financier en ajout seul (§31 du plan) : jamais de DELETE ni d''UPDATE sur une ligne existante. Corriger une erreur avec une nouvelle ligne REVERSAL référençant reversed_ledger_id, jamais en modifiant l''originale.';

CREATE INDEX idx_wallet_ledger_partner ON partner_wallet_ledger(partner_id, created_at DESC);
CREATE INDEX idx_wallet_ledger_wallet ON partner_wallet_ledger(wallet_id, created_at DESC);

-- Aucun UPDATE ni DELETE, même par service_role via l'API PostgREST — la
-- seule voie d'écriture est le SQL exécuté par les fonctions ci-dessous,
-- appelées en SECURITY DEFINER. Un grand livre qu'on peut corriger à coups
-- d'UPDATE n'en est plus un. Un trigger qui lève une exception plutôt qu'une
-- RULE qui absorbe silencieusement l'opération : une tentative de correction
-- directe doit échouer bruyamment, pas donner l'illusion d'avoir réussi.
CREATE OR REPLACE FUNCTION reject_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'partner_wallet_ledger est en ajout seul (§31) — % interdit, utilisez une écriture REVERSAL', TG_OP;
END;
$$;

CREATE TRIGGER trg_reject_ledger_update
  BEFORE UPDATE ON partner_wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

CREATE TRIGGER trg_reject_ledger_delete
  BEFORE DELETE ON partner_wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

-- ── usage_events ─────────────────────────────────────────────────────────
-- Chaque débit PAYG part d'un événement métier (§33). `idempotency_key` est
-- UNIQUE : une requête API rejouée (client qui retente, double-clic, retry
-- réseau) ne peut pas débiter deux fois — voir debit_partner_wallet().

CREATE TABLE usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  cooperative_id uuid REFERENCES cooperatives(id),
  billing_rule_id uuid NOT NULL REFERENCES billing_rules(id),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_fcfa integer NOT NULL,  -- capturé au moment du débit : survit même si billing_rules change plus tard
  amount_fcfa integer NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE usage_events IS
  'Un usage_events n''existe que pour un débit RÉUSSI — voir debit_partner_wallet(). Solde insuffisant = aucune ligne créée ici, l''opération PAYG elle-même doit être bloquée par l''appelant (§77 : bloquer uniquement la nouvelle opération, jamais verrouiller le compte).';

CREATE INDEX idx_usage_events_partner ON usage_events(partner_id, created_at DESC);

ALTER TABLE partner_wallet_ledger
  ADD CONSTRAINT fk_wallet_ledger_usage_event FOREIGN KEY (usage_event_id) REFERENCES usage_events(id);

-- ── partner_payment_intents ──────────────────────────────────────────────
-- Réutilise le fournisseur CinetPay (lib/payments/cinetpay.ts), pas le
-- schéma `payments` (§37) : `provider_reference` est le
-- `transaction_id`/`reference` passé à CinetPay et relu par son callback.

CREATE TABLE partner_payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  purpose partner_payment_purpose NOT NULL,
  amount_fcfa integer NOT NULL CHECK (amount_fcfa > 0),
  provider text NOT NULL DEFAULT 'cinetpay',
  provider_reference text NOT NULL UNIQUE,
  status partner_payment_intent_status NOT NULL DEFAULT 'pending',
  phone text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES profiles(id),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE partner_payment_intents IS
  'Paiements entrants côté Partenaire (rechargement, certification, futur abonnement) — jamais mélangés à payments (cotisations). Le callback CinetPay dédié (app/api/partner/payments/cinetpay-callback) relit provider_reference, jamais cooperative_id/cotisation_id qui n''existent pas ici.';

CREATE INDEX idx_partner_payment_intents_partner ON partner_payment_intents(partner_id, created_at DESC);

ALTER TABLE partner_wallet_ledger
  ADD CONSTRAINT fk_wallet_ledger_payment_intent FOREIGN KEY (payment_intent_id) REFERENCES partner_payment_intents(id);

-- ── Fonctions financières — sérialisation par verrou de ligne (§32) ──────
-- SECURITY DEFINER pour écrire dans un grand livre que même service_role ne
-- peut plus UPDATE/DELETE directement (les RULE ci-dessus). STABLE exclu à
-- dessein : ce sont des écritures, pas des lectures.

CREATE OR REPLACE FUNCTION credit_partner_wallet(
  p_partner_id uuid,
  p_entry_type partner_ledger_entry_type,
  p_amount_fcfa integer,
  p_idempotency_key text,
  p_payment_intent_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_wallet partner_wallets%ROWTYPE;
  v_new_balance integer;
  v_ledger_id uuid;
  v_existing partner_wallet_ledger%ROWTYPE;
BEGIN
  IF p_amount_fcfa <= 0 THEN
    RAISE EXCEPTION 'credit_partner_wallet: amount must be positive, got %', p_amount_fcfa;
  END IF;

  SELECT * INTO v_existing FROM partner_wallet_ledger WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome', 'already_applied', 'ledger_id', v_existing.id, 'balance_fcfa', v_existing.balance_after);
  END IF;

  SELECT * INTO v_wallet FROM partner_wallets WHERE partner_id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'no_wallet');
  END IF;

  v_new_balance := v_wallet.balance_fcfa + p_amount_fcfa;

  INSERT INTO partner_wallet_ledger
    (wallet_id, partner_id, entry_type, amount_fcfa, balance_after, payment_intent_id, idempotency_key, note, created_by)
  VALUES
    (v_wallet.id, p_partner_id, p_entry_type, p_amount_fcfa, v_new_balance, p_payment_intent_id, p_idempotency_key, p_note, p_created_by)
  RETURNING id INTO v_ledger_id;

  UPDATE partner_wallets SET balance_fcfa = v_new_balance, updated_at = now() WHERE id = v_wallet.id;

  RETURN jsonb_build_object('outcome', 'applied', 'ledger_id', v_ledger_id, 'balance_fcfa', v_new_balance);
END;
$$;

COMMENT ON FUNCTION credit_partner_wallet IS
  'Crédite le portefeuille sous verrou de ligne (FOR UPDATE) — deux crédits concurrents du même Partenaire se sérialisent ici. Idempotent par idempotency_key : un rejeu renvoie already_applied sans créditer deux fois.';

CREATE OR REPLACE FUNCTION debit_partner_wallet(
  p_partner_id uuid,
  p_billing_rule_code text,
  p_idempotency_key text,
  p_quantity integer DEFAULT 1,
  p_cooperative_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_rule billing_rules%ROWTYPE;
  v_wallet partner_wallets%ROWTYPE;
  v_amount integer;
  v_new_balance integer;
  v_event_id uuid;
  v_existing_event usage_events%ROWTYPE;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'debit_partner_wallet: quantity must be positive, got %', p_quantity;
  END IF;

  -- Idempotence AVANT tout verrou : un rejeu ne doit même pas attendre le
  -- verrou du portefeuille d'un autre débit en cours.
  SELECT * INTO v_existing_event FROM usage_events WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome', 'already_charged', 'usage_event_id', v_existing_event.id, 'amount_fcfa', v_existing_event.amount_fcfa);
  END IF;

  SELECT * INTO v_rule FROM billing_rules
    WHERE code = p_billing_rule_code AND active
      AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now())
    ORDER BY effective_from DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'no_active_rule');
  END IF;

  v_amount := v_rule.price_xof * p_quantity;

  -- Verrou de ligne : un second débit concurrent du même portefeuille
  -- attend ici, relit le solde déjà décrémenté, et refuse à son tour si le
  -- reste ne suffit plus. Deux débits ne peuvent jamais dépenser le même
  -- FCFA (§32).
  SELECT * INTO v_wallet FROM partner_wallets WHERE partner_id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'no_wallet');
  END IF;

  IF v_wallet.balance_fcfa < v_amount THEN
    -- Rien n'est créé : ni usage_events ni ligne de grand livre. L'appelant
    -- bloque UNIQUEMENT cette opération (§77) — aucune donnée organisationnelle
    -- n'est jamais concernée par ce chemin.
    RETURN jsonb_build_object('outcome', 'insufficient_funds', 'balance_fcfa', v_wallet.balance_fcfa, 'required_fcfa', v_amount);
  END IF;

  v_new_balance := v_wallet.balance_fcfa - v_amount;

  INSERT INTO usage_events
    (partner_id, cooperative_id, billing_rule_id, quantity, unit_price_fcfa, amount_fcfa, idempotency_key)
  VALUES
    (p_partner_id, p_cooperative_id, v_rule.id, p_quantity, v_rule.price_xof, v_amount, p_idempotency_key)
  RETURNING id INTO v_event_id;

  INSERT INTO partner_wallet_ledger
    (wallet_id, partner_id, entry_type, amount_fcfa, balance_after, usage_event_id, idempotency_key)
  VALUES
    (v_wallet.id, p_partner_id, 'DEBIT', -v_amount, v_new_balance, v_event_id, p_idempotency_key);

  UPDATE partner_wallets SET balance_fcfa = v_new_balance, updated_at = now() WHERE id = v_wallet.id;

  RETURN jsonb_build_object('outcome', 'charged', 'usage_event_id', v_event_id, 'amount_fcfa', v_amount, 'balance_fcfa', v_new_balance);
END;
$$;

COMMENT ON FUNCTION debit_partner_wallet IS
  'Débit atomique : vérification de solde et écriture sous le MÊME verrou de ligne (FOR UPDATE), donc jamais de fenêtre entre lire et écrire où deux débits concurrents passeraient tous les deux. outcome=insufficient_funds ne crée rien — voir §77 du plan.';

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Même posture que PR 1 : lecture pour les membres du Partenaire concerné et
-- super_admin, écriture réservée aux fonctions SECURITY DEFINER ci-dessus
-- (appelées depuis des routes serveur avec le client admin) — jamais un
-- policy `service_role` générique copié depuis l'existant (§40, qui met en
-- garde précisément contre ce copier-coller).

ALTER TABLE billing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_payment_intents ENABLE ROW LEVEL SECURITY;

-- Catalogue de prix : lisible par tout compte authentifié (un Partenaire
-- doit savoir combien coûte une opération avant de la déclencher), jamais
-- par le public anonyme.
CREATE POLICY "billing_rules: lecture authentifiée" ON billing_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "partner_wallets: membres et super_admin lisent" ON partner_wallets
  FOR SELECT TO authenticated
  USING (
    partner_id = ANY(current_partner_ids())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "partner_wallet_ledger: membres et super_admin lisent" ON partner_wallet_ledger
  FOR SELECT TO authenticated
  USING (
    partner_id = ANY(current_partner_ids())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "usage_events: membres et super_admin lisent" ON usage_events
  FOR SELECT TO authenticated
  USING (
    partner_id = ANY(current_partner_ids())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "partner_payment_intents: membres et super_admin lisent" ON partner_payment_intents
  FOR SELECT TO authenticated
  USING (
    partner_id = ANY(current_partner_ids())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
