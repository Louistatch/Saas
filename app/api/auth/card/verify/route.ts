import { verifyCardLoginCode } from '@/lib/security/card-login'
import { CARD_SESSION_TTL_SECONDS, cardSessionCookieName } from '@/lib/security/card-session'
import { normalizedCardNumber } from '@/lib/security/card-access'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/auth/card/verify — échange le code SMS contre une session de carte.
 *
 * La session est un cookie HttpOnly signé, propre à UNE carte. Elle ouvre
 * l'espace privé de cette carte sur /verify/[carte] et rien d'autre : ni le
 * tableau de bord, ni une autre carte.
 */

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  const limited = await applyRateLimit(request, 'verify')
  if (limited) return limited

  const body = (await request.json().catch(() => null)) as {
    card_number?: unknown
    code?: unknown
  } | null
  if (typeof body?.card_number !== 'string' || typeof body?.code !== 'string') {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const cardNumber = normalizedCardNumber(body.card_number)
  const result = await verifyCardLoginCode(body.card_number, body.code)

  if (!result.ok || !cardNumber) {
    const failure = result.ok ? ({ reason: 'invalid' } as const) : result
    switch (failure.reason) {
      case 'wrong_code':
        return NextResponse.json(
          {
            error: 'Code incorrect.',
            code: failure.reason,
            attempts_left: 'attemptsLeft' in failure ? failure.attemptsLeft : undefined,
          },
          { status: 400, headers: NO_STORE },
        )
      case 'expired':
        return NextResponse.json(
          { error: 'Ce code a expiré. Demandez-en un nouveau.', code: failure.reason },
          { status: 400, headers: NO_STORE },
        )
      case 'locked':
        return NextResponse.json(
          { error: 'Trop d’essais. Réessayez dans une heure.', code: failure.reason },
          { status: 429, headers: { ...NO_STORE, 'Retry-After': '3600' } },
        )
      case 'not_configured':
        return NextResponse.json(
          { error: 'La connexion par carte est indisponible pour le moment.', code: failure.reason },
          { status: 503, headers: NO_STORE },
        )
      default:
        return NextResponse.json(
          { error: 'Connexion impossible avec ce code.', code: 'invalid' },
          { status: 400, headers: NO_STORE },
        )
    }
  }

  const response = NextResponse.json(
    { ok: true, expires_at: result.expiresAt.toISOString() },
    { headers: NO_STORE },
  )
  response.cookies.set(cardSessionCookieName(cardNumber), result.token, {
    httpOnly: true,
    // Secure partout sauf en développement local (http://localhost).
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CARD_SESSION_TTL_SECONDS,
  })
  return response
}
