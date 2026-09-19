-- Nommé directement à la vraie version distante (20260919140105) dès sa
-- création — la leçon de la réconciliation PR 2.1 étant justement de ne
-- plus nommer un fichier local avant de connaître le nom que
-- apply_migration lui donne réellement.
-- ─────────────────────────────────────────────────────────────────────────────
-- Carte physique — PR 3 du plan à 4 PR
--
-- ── Identité numérique ≠ impression physique (§42 du plan) ───────────────
-- `member_cards` reste focalisée sur l'identité et la vérification QR ; elle
-- n'accueille aucune colonne financière. La vente de la carte imprimée est
-- un domaine de traitement séparé (§43), qui RÉFÉRENCE `member_cards` sans
-- jamais la modifier. Le renderer existant (lib/card-engine/, réutilisé tel
-- quel — §49, aucun second moteur de rendu) continue de produire des cartes
-- gratuites à l'écran ; ce PR ajoute le circuit PAYANT d'impression et de
-- livraison par un Partenaire, par-dessus, sans y toucher.
--
-- ── Répartition économique (§44) ──────────────────────────────────────────
--   Le membre paie      : 2 000 FCFA
--   L'organisation touche :  500 FCFA (créance suivie, jamais versée en
--                            automatique — §46)
--   Le Partenaire garde  : 1 500 FCFA (impression, PVC, transport, service,
--                            coût PAYG FaîtiereHub — FaîtiereHub ne prélève
--                            pas de pourcentage fixe sur ces 2 000 FCFA,
--                            elle se rémunère sur l'usage PAYG du Partenaire)
--
-- ── Deux tables, nommées par le plan lui-même (§43) ───────────────────────
-- `card_print_orders` (le lot, une organisation, un Partenaire assigné) et
-- `card_print_order_items` (une carte physique par membre dans ce lot) —
-- distinction nécessaire parce que l'économie est PAR CARTE (2 000 FCFA
-- chacune) alors que le paiement et l'impression se pilotent PAR LOT.
--
-- ── Paiement : sur la commande elle-même, pas une table d'intentions ─────
-- Contrairement au portefeuille PAYG (PR 2, plusieurs rechargements dans le
-- temps → `partner_payment_intents` séparée), une commande de cartes est un
-- paiement UNIQUE et définitif : la référence CinetPay vit directement sur
-- `card_print_orders`. Toujours le fournisseur existant
-- (lib/payments/cinetpay.ts), jamais le schéma `payments` (cotisations,
-- `cooperative_id`/`cotisation_id` n'ont pas de sens ici — même raisonnement
-- qu'en PR 2, §36-37) — et un callback dédié, pas une branche de plus dans
-- celui des cotisations (§39).
--
-- ── organization_earnings (§45) ───────────────────────────────────────────
-- Une ligne par carte imprimée, pas une par commande : même philosophie que
-- `partner_wallet_ledger` en PR 2, un enregistrement granulaire et
-- auditable plutôt qu'un agrégat. `status` suit exactement les quatre
-- valeurs du plan (pending/available/paid/cancelled) — jamais de virement
-- automatique prétendu (§46), seulement une créance qu'un super_admin
-- règle manuellement, référence de règlement à l'appui.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE card_print_order_status AS ENUM (
  'requested',  -- créée par l'organisation, pas encore payée
  'paid',       -- paiement CinetPay confirmé, gains organisation générés (pending)
  'printed',    -- toutes les cartes du lot sont imprimées
  'delivered',  -- lot remis à l'organisation
  'cancelled'
);

CREATE TYPE organization_earning_status AS ENUM (
  'pending', 'available', 'paid', 'cancelled'
);

-- ── card_print_orders ────────────────────────────────────────────────────

CREATE TABLE card_print_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id uuid NOT NULL REFERENCES cooperatives(id),
  partner_id uuid NOT NULL REFERENCES partners(id),
  status card_print_order_status NOT NULL DEFAULT 'requested',
  requested_by uuid REFERENCES profiles(id),
  provider text NOT NULL DEFAULT 'cinetpay',
  provider_reference text UNIQUE,
  amount_fcfa integer NOT NULL CHECK (amount_fcfa > 0),
  paid_at timestamptz,
  printed_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE card_print_orders IS
  'Un lot de cartes physiques commandé par une organisation à un Partenaire assigné. amount_fcfa = somme des unit_price_fcfa de card_print_order_items au moment de la commande, payé en une seule transaction CinetPay.';

CREATE INDEX idx_card_print_orders_coop ON card_print_orders(cooperative_id, created_at DESC);
CREATE INDEX idx_card_print_orders_partner ON card_print_orders(partner_id, status);

-- ── card_print_order_items ───────────────────────────────────────────────
-- `member_card_id` est obligatoire : imprimer suppose une identité
-- numérique déjà émise (le parcours existant de génération de carte,
-- inchangé) — jamais l'inverse.

CREATE TABLE card_print_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES card_print_orders(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id),
  member_card_id uuid NOT NULL REFERENCES member_cards(id),
  unit_price_fcfa integer NOT NULL,  -- capturé depuis billing_rules à la commande, même principe que usage_events (PR 2)
  printed_at timestamptz,
  reprint_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, member_card_id)
);

COMMENT ON TABLE card_print_order_items IS
  'Une ligne = une carte physique. reprint_count suit les réimpressions (§48 du plan, « Reprints » comme état de file distinct) sans dupliquer la ligne.';

CREATE INDEX idx_card_print_order_items_order ON card_print_order_items(order_id);

-- ── organization_earnings ────────────────────────────────────────────────

CREATE TABLE organization_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id uuid NOT NULL REFERENCES cooperatives(id),
  partner_id uuid NOT NULL REFERENCES partners(id),
  order_id uuid NOT NULL REFERENCES card_print_orders(id),
  order_item_id uuid NOT NULL UNIQUE REFERENCES card_print_order_items(id),
  amount_fcfa integer NOT NULL CHECK (amount_fcfa > 0),
  currency text NOT NULL DEFAULT 'XOF',
  status organization_earning_status NOT NULL DEFAULT 'pending',
  settlement_method text,
  settlement_reference text,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE organization_earnings IS
  'Créance de 500 FCFA par carte imprimée, due à l''organisation (§45 du plan). Jamais de paiement automatisé (§46) : `status` documente pending → available (à l''impression) → paid (règlement manuel, hors plateforme, tracé par settlement_method/settlement_reference) ; cancelled si la commande est annulée avant impression.';

CREATE INDEX idx_org_earnings_coop ON organization_earnings(cooperative_id, status);
CREATE INDEX idx_org_earnings_partner ON organization_earnings(partner_id, status);

-- ── Tarif (§34, même catalogue que la certification en PR 2) ────────────
INSERT INTO billing_rules (code, label, unit, price_xof, metadata) VALUES
  ('physical_card_fee', 'Carte membre physique', 'carte', 2000,
   jsonb_build_object('organization_share_fcfa', 500, 'partner_share_fcfa', 1500));

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Lecture pour l'organisation concernée (has_org_access, la fonction
-- organisationnelle existante — un Partenaire n'est jamais une autorité
-- organisationnelle, §15 du plan), le Partenaire assigné (current_partner_ids)
-- et super_admin. Écriture réservée au service_role depuis des routes
-- serveur, même posture que PR 1/2 (§40 : jamais un policy générique copié).

ALTER TABLE card_print_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_print_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card_print_orders: organisation, partenaire, super_admin lisent" ON card_print_orders
  FOR SELECT TO authenticated
  USING (
    cooperative_id = ANY(get_accessible_cooperative_ids())
    OR partner_id = ANY(current_partner_ids())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "card_print_order_items: visibilité alignée sur la commande" ON card_print_order_items
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT id FROM card_print_orders
      WHERE cooperative_id = ANY(get_accessible_cooperative_ids())
         OR partner_id = ANY(current_partner_ids())
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "organization_earnings: organisation, partenaire, super_admin lisent" ON organization_earnings
  FOR SELECT TO authenticated
  USING (
    cooperative_id = ANY(get_accessible_cooperative_ids())
    OR partner_id = ANY(current_partner_ids())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
