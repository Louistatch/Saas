// Administration des cartes professionnelles Haroo (super_admin uniquement).
//
// POST { action: 'issue', profile_type, profile_id }
//   → génère un numéro unique (OUV-/ACH-/AGR-NNNNNN), insère la carte dans
//     member_cards (card_type Haroo, sans coopérative ni membre) et reporte
//     le numéro sur le profil. Les agronomes doivent être validés avant.
//
// POST { action: 'validate_agronome', profile_id, decision, reason? }
//   → VALIDE (badge accordé + carte émise automatiquement) ou REJETE (motif).
//   Logique partagée : lib/professionals/server.ts (decideProfessional).
//
// La carte émise est immédiatement vérifiable par QR via le flux existant
// (/api/verify/[card] → AgriTogo /api/v1/haroo/verify/[card]).

import {
  decideProfessional,
  issueProfessionalCard,
  notifyCardIssued,
} from '@/lib/professionals/server'
import { issueAgronomePin } from '@/lib/security/agronome-pin'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('issue'),
    profile_type: z.enum(['OUVRIER', 'ACHETEUR', 'AGRONOME']),
    profile_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('issue_agronome_pin'),
    profile_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('validate_agronome'),
    profile_id: z.string().uuid(),
    decision: z.enum(['VALIDE', 'REJETE']),
    reason: z.string().trim().max(500).optional(),
  }),
])

export async function POST(request: NextRequest) {
  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`haroo-cards-admin:${ip}`, 30, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }

  const auth = await assertRole('super_admin')
  if (!auth.ok) return auth.response
  const raw: unknown = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }
  const body = parsed.data

  // ── PIN de la carte agronome ────────────────────────────────────────────────
  // Le PIN en clair n'est renvoyé QU'ICI, une fois : à remettre avec la carte.
  // Il est demandé pour accepter et pour terminer une mission.
  if (body.action === 'issue_agronome_pin') {
    const issued = await issueAgronomePin(body.profile_id, auth.ctx.userId)
    if (!issued.ok) {
      const message =
        issued.reason === 'no_card'
          ? 'Émettez d’abord la carte (agronome validé).'
          : issued.reason === 'not_configured'
            ? 'CARD_AUTH_SECRET non configuré.'
            : 'Émission du PIN impossible.'
      return NextResponse.json(
        { error: message },
        { status: issued.reason === 'no_card' ? 409 : 500 },
      )
    }
    return NextResponse.json({ success: true, pin: issued.pin, card_number: issued.cardNumber })
  }

  // ── Validation d'un agronome ────────────────────────────────────────────────
  // Même logique que /api/professionals/[id]/decision (lib/professionals) :
  // traçabilité (validated_by/at) et émission automatique de la carte.
  if (body.action === 'validate_agronome') {
    const result = await decideProfessional({
      ctx: auth.ctx,
      profileId: body.profile_id,
      decision: body.decision,
      reason: body.reason ?? null,
      defer: (task) => after(task),
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ success: true, ...result })
  }

  // ── Émission d'une carte ────────────────────────────────────────────────────
  const issued = await issueProfessionalCard(
    createAdminClient(),
    body.profile_id,
    body.profile_type,
  )
  if (!issued.ok) {
    const status =
      issued.reason === 'not_found' ? 404 : issued.reason === 'not_validated' ? 409 : 500
    return NextResponse.json({ error: issued.error }, { status })
  }
  if (!issued.created) {
    return NextResponse.json(
      { error: `Une carte existe déjà : ${issued.card_number}` },
      { status: 409 },
    )
  }

  after(() => notifyCardIssued(issued))

  return NextResponse.json({
    success: true,
    card_number: issued.card_number,
    expiry_date: issued.expiry_date,
  })
}
