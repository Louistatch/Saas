// Agents d'une institution : liste (coopératives, formation, cartes émises, dernière activité)
// et invitation. Gérant ou propriétaire d'un opérateur institutionnel.

import { emailAddress } from '@/lib/email/resend'
import { appUrlOf, newInvitationToken, readJson } from '@/lib/payg/http'
import { deny, profileNames, requirePaygMember } from '@/lib/payg/server'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const INVITE_DAYS = 14

export async function GET(request: NextRequest) {
  const guard = await requirePaygMember(
    new URL(request.url).searchParams.get('partner_id'),
    'manager',
  )
  if (!guard.ok) return guard.response
  const { ctx, membership } = guard
  if (membership.kind !== 'institutional')
    return deny(403, 'Réservé aux opérateurs institutionnels')
  const admin = ctx.admin
  const partnerId = membership.partnerId

  const [members, coops, training, certs, cards, activity, invitations] = await Promise.all([
    admin
      .from('partner_memberships')
      .select('user_id, membership_role, status, created_at')
      .eq('partner_id', partnerId)
      .order('created_at'),
    admin
      .from('partner_agent_cooperatives')
      .select('user_id, cooperative_id, scopes, cooperatives(name)')
      .eq('partner_id', partnerId)
      .eq('status', 'active')
      .returns<
        {
          user_id: string
          cooperative_id: string
          scopes: string[]
          cooperatives: { name: string } | null
        }[]
      >(),
    admin
      .from('training_fee_accounts')
      .select('id, user_id, total_fcfa, paid_fcfa, payer, status')
      .eq('partner_id', partnerId),
    admin
      .from('partner_certifications')
      .select('user_id, training_completed_at, exam_passed_at, certified_at')
      .eq('partner_id', partnerId),
    admin.from('card_issuance_requests').select('actor_id').eq('partner_id', partnerId),
    admin
      .from('partner_activity_log')
      .select('actor_id, created_at')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })
      .limit(1000),
    admin
      .from('partner_agent_invitations')
      .select(
        'id, email, full_name, membership_role, expires_at, accepted_at, revoked_at, created_at',
      )
      .eq('partner_id', partnerId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false }),
  ])

  const people = members.data ?? []
  const names = await profileNames(
    admin,
    people.map((m) => m.user_id),
  )
  const cardsBy = new Map<string, number>()
  for (const c of cards.data ?? [])
    if (c.actor_id) cardsBy.set(c.actor_id, (cardsBy.get(c.actor_id) ?? 0) + 1)
  const lastBy = new Map<string, string>()
  for (const a of activity.data ?? [])
    if (a.actor_id && !lastBy.has(a.actor_id)) lastBy.set(a.actor_id, a.created_at)

  return NextResponse.json({
    agents: people.map((m) => ({
      user_id: m.user_id,
      name: names.get(m.user_id)?.name ?? '',
      email: names.get(m.user_id)?.email ?? null,
      role: m.membership_role,
      status: m.status,
      joined_at: m.created_at,
      cooperatives: (coops.data ?? [])
        .filter((c) => c.user_id === m.user_id)
        .map((c) => ({ id: c.cooperative_id, name: c.cooperatives?.name ?? '', scopes: c.scopes })),
      training: (training.data ?? []).find((t) => t.user_id === m.user_id) ?? null,
      certification: (certs.data ?? []).find((c) => c.user_id === m.user_id) ?? null,
      cards_issued: cardsBy.get(m.user_id) ?? 0,
      last_activity_at: lastBy.get(m.user_id) ?? null,
    })),
    invitations: (invitations.data ?? []).filter((i) => new Date(i.expires_at) > new Date()),
  })
}

const inviteSchema = z.object({
  partner_id: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(200),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional(),
  role: z.enum(['agent', 'manager']).default('agent'),
})

export async function POST(request: NextRequest) {
  const limit = rateLimit(`institution-invite:${clientKeyFromHeaders(request.headers)}`, 30, 60_000)
  if (!limit.ok) return deny(429, 'Trop de requêtes')
  const parsed = inviteSchema.safeParse(await readJson(request))
  if (!parsed.success) return deny(400, 'Invitation invalide (nom et e-mail requis)')
  const guard = await requirePaygMember(parsed.data.partner_id, 'manager')
  if (!guard.ok) return guard.response
  const { ctx, membership } = guard
  if (membership.kind !== 'institutional')
    return deny(403, 'Réservé aux opérateurs institutionnels')
  // Seul le propriétaire nomme un autre gérant.
  if (parsed.data.role === 'manager' && membership.role !== 'owner') {
    return deny(403, 'Seul le responsable de l’institution nomme un gérant')
  }

  const { token, hash } = newInvitationToken()
  const expires = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString()
  const { data: invitation, error } = await ctx.admin
    .from('partner_agent_invitations')
    .insert({
      partner_id: membership.partnerId,
      email: parsed.data.email,
      full_name: parsed.data.full_name,
      phone: parsed.data.phone ?? null,
      membership_role: parsed.data.role,
      token_hash: hash,
      expires_at: expires,
      created_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error || !invitation) return deny(502, 'Invitation impossible')

  const link = `${appUrlOf(request)}/invitation/${token}`
  await ctx.admin.from('partner_activity_log').insert({
    partner_id: membership.partnerId,
    actor_id: ctx.userId,
    action: 'agent.invited',
    details: { email: parsed.data.email, role: parsed.data.role },
  })
  await emailAddress(parsed.data.email, `Invitation : agent ${membership.displayName}`, {
    title: `${membership.displayName} vous invite sur FaîtièreHub`,
    lines: [
      `Bonjour ${parsed.data.full_name},`,
      `${membership.displayName} vous invite à rejoindre son équipe d'opérateurs sur FaîtièreHub.`,
      `Ce lien est personnel et valable ${INVITE_DAYS} jours.`,
    ],
    cta: { label: 'Accepter l’invitation', path: `/invitation/${token}` },
  })
  // Le lien est rendu une seule fois, pour être partagé (WhatsApp) si l'e-mail n'arrive pas.
  return NextResponse.json({ invitation_id: invitation.id, link, expires_at: expires })
}
