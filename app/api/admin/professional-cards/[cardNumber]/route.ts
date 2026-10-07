// Cycle de vie d'une carte professionnelle (super_admin uniquement).
//
// POST { action: 'suspend' | 'reactivate' | 'revoke' | 'renew', reason? }
//   suspend    : active → suspendue (réversible) ;
//   reactivate : suspendue → active ;
//   revoke     : définitif, motif obligatoire ;
//   renew      : nouvelle échéance + NOUVEAU jeton de vérification (l'ancien
//                QR /verify/t/<jeton> cesse de fonctionner). Impossible sur
//                une carte révoquée.

import { CARD_VALIDITY_DAYS, computeCardStatus, expiryFrom } from '@/lib/professionals/core'
import { generateVerifyToken } from '@/lib/professionals/verify-token'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  action: z.enum(['suspend', 'reactivate', 'revoke', 'renew']),
  reason: z.string().trim().max(500).optional(),
})

const PRO_CARD_TYPES = ['OUVRIER', 'ACHETEUR', 'AGRONOME']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ cardNumber: string }> },
) {
  const limit = rateLimit(`pro-cards-admin:${clientKeyFromHeaders(request.headers)}`, 30, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })

  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  const { cardNumber: raw } = await params
  const cardNumber = decodeURIComponent(raw).toUpperCase().trim()
  if (!/^[A-Z]{2,5}-\d{4,6}$/.test(cardNumber)) {
    return NextResponse.json({ error: 'Numéro de carte invalide' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  const { action } = parsed.data
  const reason = parsed.data.reason || null

  const admin = createAdminClient()
  const { data: card } = await admin
    .from('member_cards')
    .select('id, card_number, card_type, status, expiry_date, revoked_at, suspended_at')
    .eq('card_number', cardNumber)
    .in('card_type', PRO_CARD_TYPES)
    .is('deleted_at', null)
    .maybeSingle<{
      id: string
      card_number: string
      card_type: string
      status: string
      expiry_date: string | null
      revoked_at: string | null
      suspended_at: string | null
    }>()
  if (!card) return NextResponse.json({ error: 'Carte introuvable' }, { status: 404 })

  const current = computeCardStatus(card)
  if (current === 'REVOKED') {
    return NextResponse.json({ error: 'Carte révoquée : action impossible' }, { status: 409 })
  }

  const now = new Date().toISOString()
  let patch: Record<string, string | null>
  switch (action) {
    case 'suspend':
      if (card.status === 'suspended') {
        return NextResponse.json({ error: 'Carte déjà suspendue' }, { status: 409 })
      }
      patch = { status: 'suspended', suspended_at: now }
      break
    case 'reactivate':
      if (card.status !== 'suspended') {
        return NextResponse.json({ error: 'La carte n’est pas suspendue' }, { status: 409 })
      }
      patch = { status: 'active', suspended_at: null }
      break
    case 'revoke':
      if (!reason) {
        return NextResponse.json({ error: 'Un motif de révocation est requis' }, { status: 400 })
      }
      patch = { status: 'revoked', revoked_at: now, revoked_reason: reason }
      break
    case 'renew':
      patch = {
        expiry_date: expiryFrom(new Date(), CARD_VALIDITY_DAYS),
        verify_token: generateVerifyToken(),
        // Une carte suspendue le reste : le renouvellement ne lève pas la suspension.
        status: card.status === 'suspended' ? 'suspended' : 'active',
      }
      break
  }

  const { error } = await admin
    .from('member_cards')
    .update({ ...patch, updated_at: now })
    .eq('id', card.id)
  if (error) return NextResponse.json({ error: 'Écriture impossible' }, { status: 500 })

  await admin.from('audit_logs').insert({
    user_id: guard.ctx.userId,
    action: `professional_card_${action}`,
    resource: 'member_cards',
    resource_id: card.id,
    details: { card_number: card.card_number, reason },
  })

  return NextResponse.json({
    success: true,
    card_number: card.card_number,
    action,
    expiry_date: patch.expiry_date ?? card.expiry_date,
  })
}
