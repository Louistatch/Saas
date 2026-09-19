/**
 * Commande de cartes physiques — domaine, pas des poignées de clic React
 * (même principe que lib/partners/certification.ts). Chaque fonction prend
 * un client déjà privilégié (service_role) ; l'autorisation vit dans la
 * route appelante.
 *
 * Digital ≠ physique (§42 du plan) : ce module ne touche jamais
 * `member_cards`, seulement les tables de traitement qui la référencent.
 */
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type { CardPrintOrderStatus } from '@/types/domain'

type AdminClient = SupabaseClient<Database>

export interface PrintOrderResult {
  ok: boolean
  error?: string
  order_id?: string
  amount_fcfa?: number
}

/**
 * Crée une commande de cartes physiques pour des membres d'une coopérative.
 * Le Partenaire est résolu automatiquement : le mandat actif avec le
 * périmètre `cards.print` sur cette coopérative (§48 — un Partenaire
 * imprime pour les organisations de son portefeuille, jamais un choix
 * arbitraire au moment de la commande). S'il n'y en a aucun ou plusieurs,
 * la commande est refusée plutôt que de deviner.
 */
export async function createPrintOrder(
  admin: AdminClient,
  params: { cooperativeId: string; memberIds: string[]; requestedBy: string },
): Promise<PrintOrderResult> {
  if (params.memberIds.length === 0) {
    return { ok: false, error: 'Aucun membre sélectionné' }
  }

  const { data: assignments } = await admin
    .from('partner_organization_assignments')
    .select('partner_id, partner_assignment_scopes!inner(scope)')
    .eq('cooperative_id', params.cooperativeId)
    .eq('status', 'active')
    .eq('partner_assignment_scopes.scope', 'cards.print')

  const partnerIds = [...new Set((assignments ?? []).map((a) => a.partner_id))]
  if (partnerIds.length === 0) {
    return {
      ok: false,
      error: "Aucun Partenaire n'est mandaté pour imprimer les cartes de cette coopérative",
    }
  }
  if (partnerIds.length > 1) {
    return {
      ok: false,
      error: 'Plusieurs Partenaires sont mandatés — désignez-en un via un mandat unique',
    }
  }
  const partnerId = partnerIds[0]

  const { data: rule } = await admin
    .from('billing_rules')
    .select('price_xof')
    .eq('code', 'physical_card_fee')
    .eq('active', true)
    .is('effective_to', null)
    .maybeSingle<{ price_xof: number }>()
  if (!rule) {
    return { ok: false, error: 'Tarif carte physique indisponible' }
  }

  // Une carte physique suppose une identité numérique déjà émise (§42) — on
  // ne crée jamais de member_cards ici, on référence ce qui existe.
  const { data: cards } = await admin
    .from('member_cards')
    .select('id, member_id')
    .eq('cooperative_id', params.cooperativeId)
    .in('member_id', params.memberIds)
    .eq('card_type', 'FAITIERE')
    .eq('status', 'active')

  const cardByMember = new Map((cards ?? []).map((c) => [c.member_id, c.id]))
  const missing = params.memberIds.filter((id) => !cardByMember.has(id))
  if (missing.length > 0) {
    return {
      ok: false,
      error: `${missing.length} membre(s) n'ont pas de carte numérique active — générez-la d'abord`,
    }
  }

  const amountFcfa = rule.price_xof * params.memberIds.length

  const { data: order, error: orderError } = await admin
    .from('card_print_orders')
    .insert({
      cooperative_id: params.cooperativeId,
      partner_id: partnerId,
      requested_by: params.requestedBy,
      amount_fcfa: amountFcfa,
    })
    .select('id')
    .single()

  if (orderError || !order) {
    return { ok: false, error: 'Création de la commande impossible' }
  }

  const { error: itemsError } = await admin.from('card_print_order_items').insert(
    params.memberIds.map((memberId) => ({
      order_id: order.id,
      member_id: memberId,
      member_card_id: cardByMember.get(memberId) as string,
      unit_price_fcfa: rule.price_xof,
    })),
  )
  if (itemsError) {
    await admin.from('card_print_orders').delete().eq('id', order.id)
    return { ok: false, error: 'Création des lignes de commande impossible' }
  }

  return { ok: true, order_id: order.id, amount_fcfa: amountFcfa }
}

/**
 * Règle une commande après paiement CinetPay confirmé : statut, puis une
 * créance `organization_earnings` (500 FCFA, statut 'pending') par carte —
 * granulaire, comme le grand livre du portefeuille (PR 2), pas un agrégat.
 * Appelée uniquement depuis le callback, après
 * `claimCardOrderForSettlement` (voir lib/payments/settle-card-order.ts) —
 * jamais directement, pour ne pas créer deux fois les créances sur un rejeu.
 */
export async function generateOrganizationEarningsForOrder(
  admin: AdminClient,
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: order } = await admin
    .from('card_print_orders')
    .select('cooperative_id, partner_id')
    .eq('id', orderId)
    .maybeSingle<{ cooperative_id: string; partner_id: string }>()
  if (!order) return { ok: false, error: 'Commande introuvable' }

  const { data: items } = await admin
    .from('card_print_order_items')
    .select('id, unit_price_fcfa')
    .eq('order_id', orderId)
  if (!items || items.length === 0) return { ok: false, error: 'Commande sans lignes' }

  const { data: rule } = await admin
    .from('billing_rules')
    .select('metadata')
    .eq('code', 'physical_card_fee')
    .eq('active', true)
    .is('effective_to', null)
    .maybeSingle<{ metadata: { organization_share_fcfa?: number } }>()
  const orgShare = rule?.metadata?.organization_share_fcfa ?? 500

  const { error } = await admin.from('organization_earnings').insert(
    items.map((item) => ({
      cooperative_id: order.cooperative_id,
      partner_id: order.partner_id,
      order_id: orderId,
      order_item_id: item.id,
      amount_fcfa: orgShare,
    })),
  )
  if (error) return { ok: false, error: 'Écriture des créances impossible' }
  return { ok: true }
}

/**
 * Marque une carte imprimée. Quand toutes les cartes d'une commande sont
 * imprimées, la commande passe 'printed' et les créances associées
 * passent 'pending' → 'available' (§45 : la créance ne devient réclamable
 * qu'une fois le service effectivement rendu).
 */
export async function markCardPrinted(
  admin: AdminClient,
  params: { orderId: string; itemId: string },
): Promise<{ ok: boolean; error?: string; order_status?: CardPrintOrderStatus }> {
  const now = new Date().toISOString()

  const { data: item, error: itemError } = await admin
    .from('card_print_order_items')
    .update({ printed_at: now })
    .eq('id', params.itemId)
    .eq('order_id', params.orderId)
    .is('printed_at', null)
    .select('id')
    .maybeSingle()
  if (itemError) return { ok: false, error: 'Écriture impossible' }
  if (!item) {
    // Déjà imprimée (idempotence) ou inexistante : ni l'un ni l'autre n'est
    // une erreur bloquante pour l'appelant.
    return { ok: true, order_status: undefined }
  }

  const { data: items } = await admin
    .from('card_print_order_items')
    .select('printed_at')
    .eq('order_id', params.orderId)
  const allPrinted = (items ?? []).every((i) => i.printed_at !== null)

  if (allPrinted) {
    await admin
      .from('card_print_orders')
      .update({ status: 'printed', printed_at: now, updated_at: now })
      .eq('id', params.orderId)
      .eq('status', 'paid')

    const { data: earningItemIds } = await admin
      .from('card_print_order_items')
      .select('id')
      .eq('order_id', params.orderId)
    await admin
      .from('organization_earnings')
      .update({ status: 'available', updated_at: now })
      .in(
        'order_item_id',
        (earningItemIds ?? []).map((i) => i.id),
      )
      .eq('status', 'pending')

    return { ok: true, order_status: 'printed' }
  }

  return { ok: true }
}

/** Marque une commande entièrement imprimée comme livrée à l'organisation. */
export async function markOrderDelivered(
  admin: AdminClient,
  orderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('card_print_orders')
    .update({ status: 'delivered', delivered_at: now, updated_at: now })
    .eq('id', orderId)
    .eq('status', 'printed')
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: 'Écriture impossible' }
  if (!data) return { ok: false, error: "La commande doit être entièrement imprimée d'abord" }
  return { ok: true }
}

/**
 * Règlement manuel d'une créance organisation (§46 — jamais de virement
 * automatisé). `settlementMethod`/`settlementReference` documentent COMMENT
 * l'argent a réellement changé de main, hors plateforme.
 */
export async function settleOrganizationEarning(
  admin: AdminClient,
  params: {
    earningId: string
    settledBy: string
    settlementMethod: string
    settlementReference?: string
  },
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('organization_earnings')
    .update({
      status: 'paid',
      settlement_method: params.settlementMethod,
      settlement_reference: params.settlementReference ?? null,
      settled_at: now,
      updated_at: now,
    })
    .eq('id', params.earningId)
    .eq('status', 'available')
    .select('id, cooperative_id, partner_id, amount_fcfa')
    .maybeSingle()
  if (error) return { ok: false, error: 'Écriture impossible' }
  if (!data) return { ok: false, error: "Cette créance n'est pas disponible au règlement" }

  await admin.from('audit_logs').insert({
    user_id: params.settledBy,
    action: 'organization_earning_settled',
    resource: 'organization_earnings',
    resource_id: data.id,
    cooperative_id: data.cooperative_id,
    details: {
      partner_id: data.partner_id,
      amount_fcfa: data.amount_fcfa,
      settlement_method: params.settlementMethod,
      settlement_reference: params.settlementReference ?? null,
    } as unknown as Database['public']['Tables']['audit_logs']['Insert']['details'],
  })

  return { ok: true }
}
