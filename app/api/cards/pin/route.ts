import { assertTenantAccess } from '@/lib/security/assert-access'
import { cardCooperative, issueCardPin } from '@/lib/security/card-pin'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * POST /api/cards/pin { card_number } — un opérateur émet (ou réémet) le PIN
 * d'une carte de sa coopérative. Le PIN n'est renvoyé qu'ici, une seule fois.
 */

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { card_number?: unknown } | null
  if (typeof body?.card_number !== 'string') {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const card = await cardCooperative(body.card_number)
  // Même réponse pour « carte inconnue » et « carte d'une autre coopérative » :
  // un opérateur ne doit pas pouvoir sonder les cartes des autres.
  const denied = NextResponse.json({ error: 'Carte introuvable.' }, { status: 404 })
  if (!card?.cooperativeId) return denied

  const guard = await assertTenantAccess(card.cooperativeId)
  if (!guard.ok) return guard.response.status === 401 ? guard.response : denied

  const issued = await issueCardPin(card.cardNumber, guard.ctx.userId)
  if (!issued.ok) {
    const status = issued.reason === 'not_configured' ? 503 : 400
    return NextResponse.json({ error: 'Impossible d’émettre le PIN.' }, { status, headers: NO_STORE })
  }
  return NextResponse.json({ pin: issued.pin, card_number: card.cardNumber }, { headers: NO_STORE })
}
