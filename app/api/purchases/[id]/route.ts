import { PENDING_LOCK_MS } from '@/lib/fiches/pending-claim'
import { canRetryPurchase, purchaseStateOf } from '@/lib/fiches/purchase-state'
import { type SettleOutcome, settlePurchaseDetailed } from '@/lib/fiches/purchases'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { type NextRequest, NextResponse } from 'next/server'

/** Relectures FedaPay autorisées (clé secrète) : par achat et par IP. */
const REFRESH_PER_PURCHASE = { max: 20, windowMs: 60_000 }
const REFRESH_PER_IP = { max: 60, windowMs: 60_000 }

/**
 * GET /api/purchases/[id] — état d'un achat (écran d'attente, page de l'achat).
 * L'identifiant d'achat (UUID aléatoire) sert de jeton : on ne renvoie que
 * l'état, le titre, le vendeur, les montants et la référence FedaPay, jamais
 * les coordonnées de l'acheteur. ?refresh=1 relit FedaPay (et règle l'achat,
 * y compris un paiement approuvé après un échec) ; au-delà des limites, l'état
 * en base est renvoyé sans relecture (`refreshed: false`, champs FedaPay null).
 *
 * `state` : pending | completed | failed | expired | refunded (purchaseStateOf).
 * `status` : statut brut en base (pending | completed | failed | refunded),
 * gardé pour la compatibilité. `can_retry` : un nouveau paiement peut être
 * lancé. `failure_reason` : code d'erreur FedaPay (last_error_code) d'un achat
 * en échec, quand FedaPay le donne. `amount_debited` / `fees` : montant
 * réellement débité (frais inclus) et frais, tels que FedaPay les renvoie
 * (champs `amount_debited` et `fees` de GET /v1/transactions/{id}, schéma
 * officiel api-reference/openapi.json du dépôt github.com/fedapay/docs) ; null
 * quand FedaPay ne les a pas encore calculés ou n'a pas été relu.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await applyRateLimit(request, 'marketplace')
  if (limited) return limited
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({ error: 'Achat invalide' }, { status: 400 })
  const refresh = new URL(request.url).searchParams.get('refresh') === '1'
  const mayRefresh =
    refresh &&
    rateLimit(`purchase-refresh:${id}`, REFRESH_PER_PURCHASE.max, REFRESH_PER_PURCHASE.windowMs)
      .ok &&
    rateLimit(
      `purchase-refresh-ip:${clientKeyFromHeaders(request.headers)}`,
      REFRESH_PER_IP.max,
      REFRESH_PER_IP.windowMs,
    ).ok
  const outcome: SettleOutcome | null = mayRefresh ? await settlePurchaseDetailed(id) : null

  const admin = createAdminClient()
  const { data } = await admin
    .from('purchases')
    .select(
      'id, fiche_id, amount, currency, payment_status, access_granted, paid_at, provider_transaction_id, created_at',
    )
    .eq('id', id)
    .maybeSingle<{
      id: string
      fiche_id: string
      amount: number
      currency: string | null
      payment_status: string
      access_granted: boolean
      paid_at: string | null
      provider_transaction_id: string | null
      created_at: string | null
    }>()
  if (!data) return NextResponse.json({ error: 'Achat introuvable' }, { status: 404 })

  // Titre et vendeur lus par le client de service : une fiche retirée de la
  // vente reste nommée sur la page de l'achat.
  const { data: fiche } = await admin
    .from('fiches_techniques')
    .select('title, cooperative_id')
    .eq('id', data.fiche_id)
    .maybeSingle<{ title: string; cooperative_id: string | null }>()
  let sellerName = 'FaîtiereHub'
  if (fiche?.cooperative_id) {
    const { data: coop } = await admin
      .from('cooperatives')
      .select('name')
      .eq('id', fiche.cooperative_id)
      .maybeSingle<{ name: string | null }>()
    sellerName = coop?.name || 'Faîtière'
  }

  // Transaction relue par CETTE requête (celle de l'achat), sinon null.
  const tx = outcome?.tx ?? null
  const state = purchaseStateOf(data, tx?.status ?? null)
  // Montant débité : seulement s'il est plausible (au moins le prix).
  const amountDebited =
    tx?.amountDebited != null && tx.amountDebited >= data.amount ? tx.amountDebited : null

  return NextResponse.json(
    {
      id: data.id,
      fiche_id: data.fiche_id,
      title: fiche?.title ?? 'Compte d’exploitation',
      seller_name: sellerName,
      amount: data.amount,
      currency: data.currency ?? 'XOF',
      state,
      status: data.payment_status,
      can_retry: canRetryPurchase(state, data.created_at, PENDING_LOCK_MS),
      failure_reason:
        state === 'failed' || state === 'expired' ? (tx?.lastErrorCode ?? null) : null,
      fedapay_status: tx?.status || null,
      amount_debited: amountDebited,
      fees: amountDebited != null ? (tx?.fees ?? null) : null,
      access_granted: data.access_granted,
      paid_at: data.paid_at,
      // Référence FedaPay (celle du reçu) : à donner au support en cas de souci.
      reference: data.provider_transaction_id,
      refreshed: mayRefresh,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
