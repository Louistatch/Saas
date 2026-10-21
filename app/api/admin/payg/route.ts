// Console PAYG super-admin : indicateurs calculés depuis les grands livres, et les actions
// réservées à l'équipe (créer une institution, enregistrer un paiement reçu hors ligne,
// corriger un solde, rendre le crédit d'une carte émise par erreur, chiffrer et suivre une
// commande FaîtièreHub Print, enregistrer une convention de données, traiter une demande de
// rectification). Chaque écriture financière passe par une fonction SQL payg_* (verrou,
// idempotence, grand livre en ajout seul).

import { appUrlOf, newInvitationToken, readJson } from '@/lib/payg/http'
import { recordManualPayment } from '@/lib/payg/payments'
import { requireSuperAdmin } from '@/lib/payg/server'
import { generateUniquePartnerCode } from '@/lib/utils/partner-code'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export async function GET() {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const admin = guard.admin
  const [overview, partners, wallets, training, orders, rectifications, ledger, mandates] =
    await Promise.all([
      admin.rpc('payg_admin_overview'),
      admin
        .from('partners')
        .select('id, partner_code, display_name, operator_kind, status, created_at')
        .order('created_at', { ascending: false }),
      admin.from('partner_wallets').select('partner_id, credit_balance, welcome_credits'),
      admin
        .from('training_fee_accounts')
        .select(
          'id, user_id, partner_id, total_fcfa, paid_fcfa, payer, status, profiles(first_name, last_name, email)',
        )
        .order('created_at', { ascending: false })
        .limit(500),
      admin
        .from('faitierehub_print_orders')
        .select(
          'id, partner_id, status, card_format, delivery_address, delivery_contact, fabrication_fcfa, delivery_fcfa, created_at, faitierehub_print_order_items(member_card_id), partners(display_name)',
        )
        .order('created_at', { ascending: false })
        .limit(100),
      admin
        .from('data_rectification_requests')
        .select(
          'id, status, description, requested_via, created_at, resolution, cooperatives(name), partners(display_name)',
        )
        .order('created_at', { ascending: false })
        .limit(100),
      admin
        .from('payg_credit_ledger')
        .select('id, partner_id, entry_type, credits, balance_after, amount_fcfa, note, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
      admin
        .from('partner_organization_assignments')
        .select(
          'id, partner_id, cooperative_id, cooperatives(name), partner_data_agreements(id, signed_on, revoked_at)',
        )
        .eq('status', 'active'),
    ])
  const walletOf = new Map((wallets.data ?? []).map((w) => [w.partner_id, w]))
  return NextResponse.json({
    overview: overview.data,
    operators: (partners.data ?? []).map((p) => ({
      ...p,
      credit_balance: walletOf.get(p.id)?.credit_balance ?? 0,
      welcome_credits: walletOf.get(p.id)?.welcome_credits ?? 0,
    })),
    training: training.data ?? [],
    print_orders: orders.data ?? [],
    rectifications: rectifications.data ?? [],
    ledger: ledger.data ?? [],
    mandates: mandates.data ?? [],
  })
}

const uuid = z.string().uuid()
const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_institution'),
    display_name: z.string().trim().min(2).max(120),
    owner_email: z.string().trim().toLowerCase().email(),
    owner_name: z.string().trim().min(2).max(120),
    phone: z.string().trim().max(40).optional(),
  }),
  z.object({
    action: z.literal('set_kind'),
    partner_id: uuid,
    kind: z.enum(['individual', 'institutional']),
  }),
  z.object({
    action: z.literal('credits_manual'),
    partner_id: uuid,
    credits: z.number().int().min(1).max(100_000),
    amount_fcfa: z.number().int().min(1),
    note: z.string().trim().min(3).max(300),
  }),
  z.object({
    action: z.literal('credits_adjust'),
    partner_id: uuid,
    credits: z.number().int().min(-100_000).max(100_000),
    note: z.string().trim().min(3).max(300),
  }),
  z.object({
    action: z.literal('training_payment'),
    account_id: uuid,
    amount_fcfa: z.number().int().positive(),
    note: z.string().trim().min(3).max(300),
  }),
  z.object({
    action: z.literal('release_card'),
    member_card_id: uuid,
    reason: z.string().trim().min(3).max(300),
  }),
  z.object({
    action: z.literal('print_quote'),
    order_id: uuid,
    fabrication_fcfa: z.number().int().min(0),
    delivery_fcfa: z.number().int().min(0),
    quote_note: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal('print_status'),
    order_id: uuid,
    status: z.enum(['paid', 'in_production', 'shipped', 'delivered', 'cancelled']),
  }),
  z.object({
    action: z.literal('record_agreement'),
    assignment_id: uuid,
    cooperative_signatory: z.string().trim().min(2).max(120),
    operator_signatory: z.string().trim().min(2).max(120),
    signed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    producers_informed: z.boolean(),
    photo_policy: z.enum(['no_photo', 'card_only']),
    document_reference: z.string().trim().max(200).optional(),
  }),
  z.object({
    action: z.literal('rectification_status'),
    request_id: uuid,
    status: z.enum(['in_progress', 'resolved', 'rejected']),
    resolution: z.string().trim().max(1000).optional(),
  }),
])

const PRINT_NEXT: Record<string, string[]> = {
  paid: ['quoted'],
  in_production: ['paid'],
  shipped: ['in_production'],
  delivered: ['shipped'],
  cancelled: ['quote_requested', 'quoted'],
}

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const parsed = actionSchema.safeParse(await readJson(request))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  const { admin, userId } = guard
  const body = parsed.data
  const now = new Date().toISOString()

  switch (body.action) {
    case 'create_institution': {
      const code = await generateUniquePartnerCode(admin, 'IN')
      const { data: partner, error } = await admin
        .from('partners')
        .insert({
          partner_code: code,
          display_name: body.display_name,
          business_name: body.display_name,
          email: body.owner_email,
          phone: body.phone ?? null,
          status: 'active',
          operator_kind: 'institutional',
        })
        .select('id')
        .single()
      if (error || !partner)
        return NextResponse.json({ error: 'Création impossible' }, { status: 502 })
      await admin.rpc('payg_grant_welcome_credits', { p_partner_id: partner.id, p_actor: userId })
      const { token, hash } = newInvitationToken()
      await admin.from('partner_agent_invitations').insert({
        partner_id: partner.id,
        email: body.owner_email,
        full_name: body.owner_name,
        membership_role: 'owner',
        token_hash: hash,
        expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        created_by: userId,
      })
      return NextResponse.json({
        partner_id: partner.id,
        partner_code: code,
        owner_link: `${appUrlOf(request)}/invitation/${token}`,
      })
    }
    case 'set_kind': {
      await admin
        .from('partners')
        .update({ operator_kind: body.kind, updated_at: now })
        .eq('id', body.partner_id)
      return NextResponse.json({ ok: true })
    }
    case 'credits_manual': {
      const result = await recordManualPayment(admin, {
        purpose: 'credit_pack',
        partnerId: body.partner_id,
        actorId: userId,
        amountFcfa: body.amount_fcfa,
        credits: body.credits,
        note: body.note,
      })
      return NextResponse.json(result, { status: result.outcome === 'applied' ? 200 : 422 })
    }
    case 'credits_adjust': {
      const { data, error } = await admin.rpc('payg_adjust_credits', {
        p_partner_id: body.partner_id,
        p_credits: body.credits,
        p_idempotency_key: `adjust:${crypto.randomUUID()}`,
        p_actor: userId,
        p_note: body.note,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 502 })
      const result = data as { outcome: string }
      return NextResponse.json(result, { status: result.outcome === 'applied' ? 200 : 422 })
    }
    case 'training_payment': {
      const { data: account } = await admin
        .from('training_fee_accounts')
        .select('partner_id')
        .eq('id', body.account_id)
        .maybeSingle()
      if (!account?.partner_id)
        return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
      const result = await recordManualPayment(admin, {
        purpose: 'training_fee',
        partnerId: account.partner_id,
        accountId: body.account_id,
        actorId: userId,
        amountFcfa: body.amount_fcfa,
        note: body.note,
      })
      return NextResponse.json(result, { status: result.outcome === 'applied' ? 200 : 422 })
    }
    case 'release_card': {
      const { data, error } = await admin.rpc('payg_release_card_commission', {
        p_member_card_id: body.member_card_id,
        p_actor: userId,
        p_reason: body.reason,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 502 })
      const result = data as { outcome: string }
      return NextResponse.json(result, { status: result.outcome === 'released' ? 200 : 422 })
    }
    case 'print_quote': {
      const { data } = await admin
        .from('faitierehub_print_orders')
        .update({
          fabrication_fcfa: body.fabrication_fcfa,
          delivery_fcfa: body.delivery_fcfa,
          quote_note: body.quote_note ?? null,
          quoted_by: userId,
          quoted_at: now,
          status: 'quoted',
          updated_at: now,
        })
        .eq('id', body.order_id)
        .in('status', ['quote_requested', 'quoted'])
        .select('id')
      if (!data?.length)
        return NextResponse.json({ error: 'Devis impossible à ce stade' }, { status: 409 })
      return NextResponse.json({ ok: true })
    }
    case 'print_status': {
      const stamp: Record<string, string> = {
        paid: 'paid_at',
        shipped: 'shipped_at',
        delivered: 'delivered_at',
        cancelled: 'cancelled_at',
      }
      const patch: Record<string, string> = { status: body.status, updated_at: now }
      if (stamp[body.status]) patch[stamp[body.status]] = now
      const { data } = await admin
        .from('faitierehub_print_orders')
        .update(patch)
        .eq('id', body.order_id)
        .in(
          'status',
          PRINT_NEXT[body.status] as (
            | 'quoted'
            | 'paid'
            | 'in_production'
            | 'shipped'
            | 'quote_requested'
          )[],
        )
        .select('id, partner_id')
      if (!data?.length)
        return NextResponse.json({ error: 'Transition impossible' }, { status: 409 })
      if (body.status === 'shipped' || body.status === 'delivered') {
        const { data: items } = await admin
          .from('faitierehub_print_order_items')
          .select('member_card_id')
          .eq('order_id', body.order_id)
        if (body.status === 'shipped' && items?.length) {
          await admin.from('card_print_events').insert(
            items.map((i) => ({
              member_card_id: i.member_card_id,
              partner_id: data[0].partner_id,
              actor_id: userId,
              mode: 'faitierehub',
            })),
          )
        }
      }
      return NextResponse.json({ ok: true })
    }
    case 'record_agreement': {
      const { data: mandate } = await admin
        .from('partner_organization_assignments')
        .select('id, partner_id, cooperative_id')
        .eq('id', body.assignment_id)
        .maybeSingle()
      if (!mandate) return NextResponse.json({ error: 'Mandat introuvable' }, { status: 404 })
      await admin
        .from('partner_data_agreements')
        .update({ revoked_at: now })
        .eq('assignment_id', mandate.id)
        .is('revoked_at', null)
      const { error } = await admin.from('partner_data_agreements').insert({
        assignment_id: mandate.id,
        partner_id: mandate.partner_id,
        cooperative_id: mandate.cooperative_id,
        cooperative_signatory: body.cooperative_signatory,
        operator_signatory: body.operator_signatory,
        signed_on: body.signed_on,
        producers_informed: body.producers_informed,
        photo_policy: body.photo_policy,
        document_reference: body.document_reference ?? null,
        recorded_by: userId,
      })
      if (error) return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 502 })
      return NextResponse.json({ ok: true })
    }
    case 'rectification_status': {
      await admin
        .from('data_rectification_requests')
        .update({
          status: body.status,
          resolution: body.resolution ?? null,
          handled_by: userId,
          resolved_at: body.status === 'in_progress' ? null : now,
        })
        .eq('id', body.request_id)
      return NextResponse.json({ ok: true })
    }
  }
}
