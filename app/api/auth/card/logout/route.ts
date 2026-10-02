import { normalizedCardNumber } from '@/lib/security/card-access'
import { cardSessionCookieName } from '@/lib/security/card-session'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/auth/card/logout — termine la session de carte.
 *
 * Utile sur un téléphone prêté ou partagé : la session dure huit heures et ne
 * doit pas survivre au départ de celui qui s'en est servi.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { card_number?: unknown } | null
  // On ne fabrique jamais un nom de cookie à partir d'une entrée non validée.
  const cardNumber =
    typeof body?.card_number === 'string' ? normalizedCardNumber(body.card_number) : null
  if (!cardNumber) {
    return NextResponse.json({ error: 'Numéro de carte invalide.' }, { status: 400 })
  }

  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  response.cookies.set(cardSessionCookieName(cardNumber), '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
