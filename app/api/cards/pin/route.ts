import { assertRole } from '@/lib/security/assert-access'
import { cardCooperative, issueCardPin } from '@/lib/security/card-pin'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * POST /api/cards/pin { card_number } — le super-administrateur seul émet (ou
 * réémet) le PIN d'une carte. Ni les opérateurs ni les administrateurs de
 * coopérative ne le peuvent. Le PIN n'est renvoyé qu'ici, une seule fois.
 */

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { card_number?: unknown } | null
  if (typeof body?.card_number !== 'string') {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  const card = await cardCooperative(body.card_number)
  if (!card) return NextResponse.json({ error: 'Carte introuvable.' }, { status: 404 })

  const issued = await issueCardPin(card.cardNumber, guard.ctx.userId)
  if (!issued.ok) {
    const status = issued.reason === 'not_configured' ? 503 : 400
    return NextResponse.json({ error: 'Impossible d’émettre le PIN.' }, { status, headers: NO_STORE })
  }
  return NextResponse.json({ pin: issued.pin, card_number: card.cardNumber }, { headers: NO_STORE })
}
