-- ─────────────────────────────────────────────────────────────────────────────
-- PR 2.1 — durcissement de la facturation Opérateur
--
-- L'advisor Supabase, relancé après PR 2, signale exactement ce que le plan
-- redoutait : les cinq fonctions posées par PR 1/2 sont SECURITY DEFINER et
-- restent exécutables par `anon` et `authenticated` via /rest/v1/rpc/<nom> —
-- PostgreSQL accorde EXECUTE à PUBLIC par défaut sur toute fonction créée,
-- et PostgREST expose tout ce que PUBLIC peut exécuter. Sans ce correctif,
-- n'importe quel client connu du navigateur pouvait appeler
-- `credit_partner_wallet` ou `debit_partner_wallet` directement, en
-- connaissant seulement leur nom — aucune route serveur, aucune
-- vérification CinetPay requise.
--
-- Même méthode que 20260919012442_revoke_public_rpc_execute.sql : tout
-- fermer, puis rouvrir fonction par fonction d'après l'usage réel constaté
-- dans le code (grep sur `.rpc('<nom>'` et sur les clauses RLS), jamais par
-- supposition.
--
-- ── Graphe d'appel vérifié avant de couper quoi que ce soit ──────────────
--
-- current_partner_ids() — appelée DANS LES CLAUSES USING de neuf policies RLS
--   (partners, partner_memberships, partner_organization_assignments,
--   partner_assignment_scopes, partner_wallets, partner_wallet_ledger,
--   usage_events, partner_payment_intents), toutes évaluées en tant que
--   `authenticated`. La couper à `authenticated` casserait toute lecture de
--   ces tables pour un compte ordinaire. Reste ouverte à `authenticated`,
--   fermée à `anon` (aucune de ces policies n'est `TO anon`).
--
-- has_partner_org_access(uuid, partner_access_scope) — appelée depuis
--   lib/security/assert-partner-access.ts::assertPartnerOrganizationAccess()
--   via `ctx.supabase.rpc(...)`, c'est-à-dire le client utilisateur normal
--   (authenticated), pas le client admin. Aucune policy RLS ne la référence
--   directement. Reste ouverte à `authenticated`, fermée à `anon`.
--
-- credit_partner_wallet(...) — un seul appelant dans tout le dépôt :
--   app/api/partner/payments/cinetpay-callback/route.ts, via
--   createClient() de lib/supabase/admin (service_role). Aucune policy RLS
--   ne la référence. service_role conserve son EXECUTE indépendamment de ces
--   révocations — vérifié empiriquement (has_function_privilege) sur une
--   fonction déjà fermée par la migration précédente. Fermée à `anon` ET
--   `authenticated` : rien de légitime ne l'appelle en dehors du callback.
--
-- debit_partner_wallet(...) — aucun appelant pour l'instant (PR 3 posera le
--   premier, l'impression de carte physique). Fermée par précaution
--   immédiate plutôt que d'attendre PR 3 : elle n'a jamais eu besoin d'être
--   ouverte, ce n'est pas un durcissement a posteriori mais l'absence du
--   laxisme initial.
--
-- create_partner_wallet() — déclencheur AFTER INSERT sur `partners`, jamais
--   appelée comme RPC. PostgreSQL vérifie EXECUTE à la création du trigger,
--   pas à chaque déclenchement (même raisonnement que le commit précédent) :
--   fermée entièrement, à tout le monde.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    'public.create_partner_wallet()',
    'public.credit_partner_wallet(uuid, public.partner_ledger_entry_type, integer, text, uuid, text, uuid)',
    'public.debit_partner_wallet(uuid, text, text, integer, uuid)',
    'public.current_partner_ids()',
    'public.has_partner_org_access(uuid, public.partner_access_scope)'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
  END LOOP;
END$$;

-- Rouvrir uniquement ce que le graphe d'appel ci-dessus exige.
GRANT EXECUTE ON FUNCTION public.current_partner_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_partner_org_access(uuid, public.partner_access_scope) TO authenticated;

COMMENT ON FUNCTION public.credit_partner_wallet IS
  'Crédite le portefeuille sous verrou de ligne (FOR UPDATE) — deux crédits concurrents du même Partenaire se sérialisent ici. Idempotent par idempotency_key : un rejeu renvoie already_applied sans créditer deux fois. AUCUN accès direct anon/authenticated (PR 2.1) — seul app/api/partner/payments/cinetpay-callback/route.ts l''appelle, via le client service_role, après vérification du paiement auprès de CinetPay.';

COMMENT ON FUNCTION public.debit_partner_wallet IS
  'Débit atomique : vérification de solde et écriture sous le MÊME verrou de ligne (FOR UPDATE), donc jamais de fenêtre entre lire et écrire où deux débits concurrents passeraient tous les deux. outcome=insufficient_funds ne crée rien — voir §77 du plan. AUCUN accès direct anon/authenticated (PR 2.1) — à appeler exclusivement depuis une route serveur avec le client service_role, jamais depuis le navigateur.';

-- ── search_path mutable sur reject_ledger_mutation ───────────────────────
-- L'advisor signale ce déclencheur comme le seul, parmi les fonctions posées
-- par PR 1/2, sans search_path pinné (SECURITY INVOKER, donc pas de risque
-- d'escalade de privilège via une table forgée, mais le linter recommande
-- de le pinner par défense en profondeur — cohérent avec le traitement déjà
-- appliqué à toutes les fonctions SECURITY DEFINER du dépôt). Le
-- comportement — rejeter tout UPDATE/DELETE sur le grand livre — est
-- entièrement préservé, seul le search_path change.
ALTER FUNCTION public.reject_ledger_mutation() SET search_path TO 'public', 'pg_temp';

-- ── Configuration du seuil de réussite à l'examen (PR 2.1, §5) ───────────
-- Le seuil vit en configuration, pas en dur dans le code de validation —
-- même principe que billing_rules pour les tarifs (§34 du plan).
INSERT INTO platform_settings (key, value)
VALUES ('partner_exam_passing_score', '70'::jsonb)
ON CONFLICT (key) DO NOTHING;
