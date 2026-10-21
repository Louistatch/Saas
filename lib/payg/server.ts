/**
 * Couche serveur PAYG : contexte du compte (ses opérateurs, son rôle dans chacun), gardes,
 * émission de carte, journal d'activité. Les règles pures sont dans lib/payg/model.ts ; les
 * garanties financières (verrou, idempotence, une commission par carte) sont dans les
 * fonctions SQL payg_* de la migration 20261021_100000_payg_operators.sql.
 *
 * Même posture que lib/security/assert-partner-access.ts : `profiles` et les tables
 * `partner_*` font foi, jamais les claims JWT. Les lectures de producteurs passent par le
 * client de l'utilisateur (RLS : has_partner_org_access) ; les écritures financières par le
 * client service_role, après ces gardes.
 */
import 'server-only'
import {
  type CardFormat,
  type IssueMode,
  type MembershipRole,
  type OperatorKind,
  capabilities,
  roleAtLeast,
} from '@/lib/payg/model'
import { getAccessContext } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { cardPrefix, generateUniqueCardNumber } from '@/lib/utils/card-number'
import type { Json } from '@/types/supabase'
import { NextResponse } from 'next/server'

export type AdminClient = ReturnType<typeof createAdminClient>

export interface PaygMembership {
  partnerId: string
  partnerCode: string
  displayName: string
  kind: OperatorKind
  status: string
  role: MembershipRole
}

export interface PaygContext {
  userId: string
  isSuperAdmin: boolean
  memberships: PaygMembership[]
  supabase: NonNullable<Awaited<ReturnType<typeof getAccessContext>>>['supabase']
  admin: AdminClient
}

interface MembershipRow {
  membership_role: MembershipRole
  partners: {
    id: string
    partner_code: string
    display_name: string
    operator_kind: OperatorKind
    status: string
  } | null
}

export async function getPaygContext(): Promise<PaygContext | null> {
  const access = await getAccessContext()
  if (!access) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('partner_memberships')
    .select('membership_role, partners(id, partner_code, display_name, operator_kind, status)')
    .eq('user_id', access.userId)
    .eq('status', 'active')
    .returns<MembershipRow[]>()
  const memberships = (data ?? [])
    .filter((m) => m.partners)
    .map((m) => ({
      partnerId: m.partners?.id ?? '',
      partnerCode: m.partners?.partner_code ?? '',
      displayName: m.partners?.display_name ?? '',
      kind: m.partners?.operator_kind ?? 'individual',
      status: m.partners?.status ?? 'candidate',
      role: m.membership_role,
    }))
  return {
    userId: access.userId,
    isSuperAdmin: access.role === 'super_admin',
    memberships,
    supabase: access.supabase,
    admin,
  }
}

type Guard =
  | { ok: true; ctx: PaygContext; membership: PaygMembership }
  | { ok: false; response: NextResponse }

export function deny(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}

/**
 * Le compte courant est-il membre actif de `partnerId`, avec au moins `minRole` ? Sans
 * `partnerId`, retient son premier opérateur (le cas d'un opérateur individuel ou d'un agent
 * qui n'en a qu'un).
 */
export async function requirePaygMember(
  partnerId: string | null | undefined,
  minRole: MembershipRole = 'agent',
): Promise<Guard> {
  const ctx = await getPaygContext()
  if (!ctx) return { ok: false, response: deny(401, 'Connexion requise') }
  const membership = partnerId
    ? ctx.memberships.find((m) => m.partnerId === partnerId)
    : ctx.memberships[0]
  if (!membership) return { ok: false, response: deny(403, 'Aucun accès à cet opérateur') }
  if (!roleAtLeast(membership.role, minRole)) {
    return { ok: false, response: deny(403, 'Rôle insuffisant pour cette action') }
  }
  return { ok: true, ctx, membership }
}

export async function requireSuperAdmin() {
  const access = await getAccessContext()
  if (!access) return { ok: false as const, response: deny(401, 'Connexion requise') }
  if (access.role !== 'super_admin') {
    return { ok: false as const, response: deny(403, 'Réservé à l’équipe FaîtièreHub') }
  }
  return { ok: true as const, userId: access.userId, admin: createAdminClient() }
}

export async function logActivity(
  admin: AdminClient,
  row: {
    partnerId: string
    actorId: string | null
    action: string
    cooperativeId?: string | null
    memberId?: string | null
    memberCardId?: string | null
    details?: Record<string, unknown>
  },
) {
  await admin.from('partner_activity_log').insert({
    partner_id: row.partnerId,
    actor_id: row.actorId,
    action: row.action,
    cooperative_id: row.cooperativeId ?? null,
    member_id: row.memberId ?? null,
    member_card_id: row.memberCardId ?? null,
    details: (row.details ?? {}) as Json,
  })
}

export async function walletOf(admin: AdminClient, partnerId: string) {
  const { data } = await admin
    .from('partner_wallets')
    .select('credit_balance, welcome_credits, welcome_granted_at')
    .eq('partner_id', partnerId)
    .maybeSingle()
  return {
    creditBalance: data?.credit_balance ?? 0,
    welcomeCredits: data?.welcome_credits ?? 0,
    welcomeGrantedAt: data?.welcome_granted_at ?? null,
  }
}

export interface ConsoleCooperative {
  id: string
  name: string
  scopes: string[]
  freeRemaining: number
}

/**
 * Coopératives sur lesquelles ce membre peut travailler : tout le mandat de l'opérateur pour
 * owner/manager, seulement celles qui lui sont confiées pour un agent (même règle que la RLS).
 */
export async function cooperativesFor(
  admin: AdminClient,
  userId: string,
  membership: PaygMembership,
): Promise<ConsoleCooperative[]> {
  const { data: mandates } = await admin
    .from('partner_organization_assignments')
    .select('cooperative_id, cooperatives(name), partner_assignment_scopes(scope)')
    .eq('partner_id', membership.partnerId)
    .eq('status', 'active')
    .returns<
      {
        cooperative_id: string
        cooperatives: { name: string } | null
        partner_assignment_scopes: { scope: string }[]
      }[]
    >()
  let rows = (mandates ?? []).map((m) => ({
    id: m.cooperative_id,
    name: m.cooperatives?.name ?? 'Coopérative',
    scopes: m.partner_assignment_scopes.map((s) => s.scope),
  }))
  if (membership.role === 'agent') {
    const { data: mine } = await admin
      .from('partner_agent_cooperatives')
      .select('cooperative_id, scopes')
      .eq('partner_id', membership.partnerId)
      .eq('user_id', userId)
      .eq('status', 'active')
    const allowed = new Map((mine ?? []).map((g) => [g.cooperative_id, g.scopes as string[]]))
    rows = rows
      .filter((r) => allowed.has(r.id))
      .map((r) => ({ ...r, scopes: r.scopes.filter((s) => allowed.get(r.id)?.includes(s)) }))
  }
  if (rows.length === 0) return []
  const { data: allowance } = await admin.rpc('payg_free_card_allowance', {
    p_cooperative_ids: rows.map((r) => r.id),
  })
  const counters = (allowance ?? []) as {
    cooperative_id: string
    card_limit: number
    cards_issued: number
  }[]
  const free = new Map<string, number>(
    counters.map((a) => [a.cooperative_id, Math.max(0, a.card_limit - a.cards_issued)]),
  )
  return rows
    .map((r) => ({ ...r, freeRemaining: free.get(r.id) ?? 10 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

export function membershipSummary(ctx: PaygContext, membership: PaygMembership) {
  return {
    partner_id: membership.partnerId,
    partner_code: membership.partnerCode,
    display_name: membership.displayName,
    kind: membership.kind,
    status: membership.status,
    role: membership.role,
    capabilities: capabilities(membership.kind, membership.role),
    other_partners: ctx.memberships
      .filter((m) => m.partnerId !== membership.partnerId)
      .map((m) => ({ partner_id: m.partnerId, display_name: m.displayName, role: m.role })),
  }
}

export interface IssueResult {
  outcome: string
  member_card_id?: string
  card_number?: string
  mode?: IssueMode
  source?: 'welcome' | 'purchased' | null
  credit_balance?: number
}

/**
 * Émet une carte via payg_issue_member_card. Le numéro est tiré au hasard (générateur existant,
 * lib/utils/card-number.ts) ; s'il est pris entre-temps, la fonction SQL annule tout (aucun
 * crédit) et l'on retente avec un autre numéro, même clé d'idempotence.
 */
export async function issueMemberCard(
  admin: AdminClient,
  input: {
    actorId: string
    partnerId: string
    memberId: string
    mode: IssueMode
    cardFormat: CardFormat
    producerPriceFcfa: number | null
    idempotencyKey: string
  },
): Promise<IssueResult> {
  const { data: member } = await admin
    .from('members')
    .select('cooperative_id, cooperatives(name, faitiere_name)')
    .eq('id', input.memberId)
    .maybeSingle<{
      cooperative_id: string
      cooperatives: { name: string; faitiere_name: string | null } | null
    }>()
  if (!member) return { outcome: 'member_not_found' }
  const prefix = cardPrefix(member.cooperatives?.faitiere_name ?? member.cooperatives?.name)
  const expiry = new Date()
  expiry.setFullYear(expiry.getFullYear() + 1)

  for (let attempt = 0; attempt < 3; attempt++) {
    const cardNumber = await generateUniqueCardNumber(admin, prefix)
    const { data, error } = await admin.rpc('payg_issue_member_card', {
      p_actor: input.actorId,
      p_partner_id: input.partnerId,
      p_member_id: input.memberId,
      p_mode: input.mode,
      p_card_number: cardNumber,
      p_expiry_date: expiry.toISOString().slice(0, 10),
      p_card_format: input.cardFormat,
      p_producer_price_fcfa: input.producerPriceFcfa as number,
      p_idempotency_key: input.idempotencyKey,
    })
    if (error) throw new Error(`payg_issue_member_card: ${error.message}`)
    const result = data as unknown as IssueResult
    if (result.outcome !== 'card_number_taken') return result
  }
  return { outcome: 'card_number_taken' }
}

/** Compte de formation d'une personne (créé à la première occasion, jamais dupliqué). */
export async function ensureTrainingAccount(
  admin: AdminClient,
  userId: string,
  partnerId: string | null,
  payer: 'self' | 'institution' = 'self',
) {
  await admin
    .from('training_fee_accounts')
    .upsert(
      { user_id: userId, partner_id: partnerId, payer },
      { onConflict: 'user_id', ignoreDuplicates: true },
    )
  const { data } = await admin
    .from('training_fee_accounts')
    .select('id, user_id, partner_id, total_fcfa, installment_fcfa, paid_fcfa, payer, status')
    .eq('user_id', userId)
    .single()
  return data
}

export async function profileNames(admin: AdminClient, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, { name: string; email: string | null }>()
  const { data } = await admin
    .from('profiles')
    .select('id, first_name, last_name, email')
    .in('id', [...new Set(userIds)])
  return new Map(
    (data ?? []).map((p) => [
      p.id,
      {
        name: [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.email ?? 'Compte'),
        email: p.email,
      },
    ]),
  )
}
