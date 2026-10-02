import { loginWithCardPin } from '@/lib/security/card-pin'
import { normalizedCardNumber } from '@/lib/security/card-access'
import { CARD_SESSION_TTL_SECONDS, cardSessionCookieName } from '@/lib/security/card-session'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/auth/card/pin — numéro de carte + PIN remis avec la carte.
 * Ouvre la même session de carte que le code SMS (cookie HttpOnly, 8 h).
 */

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  const limited = await applyRateLimit(request, 'verify')
  if (limited) return limited

  const body = (await request.json().catch(() => null)) as { card_number?: unknown; pin?: unknown } | null
  if (typeof body?.card_number !== 'string' || typeof body?.pin !== 'string') {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const cardNumber = normalizedCardNumber(body.card_number)
  const result = await loginWithCardPin(body.card_number, body.pin)

  if (!result.ok || !cardNumber) {
    const f = result.ok ? ({ reason: 'invalid' } as const) : result
    switch (f.reason) {
      case 'wrong_pin':
        return NextResponse.json(
          { error: 'PIN incorrect.', code: 'wrong_pin', attempts_left: f.attemptsLeft },
          { status: 400, headers: NO_STORE },
        )
      case 'locked': {
        const wait = 'retryAfterSeconds' in f ? f.retryAfterSeconds : undefined
        return NextResponse.json(
          {
            error: wait
              ? 'Trop d’essais. Réessayez plus tard.'
              : 'Carte verrouillée. Demandez un nouveau PIN à votre coopérative.',
            code: 'locked',
            retry_after: wait,
          },
          { status: 429, headers: { ...NO_STORE, ...(wait ? { 'Retry-After': String(wait) } : {}) } },
        )
      }
      case 'no_pin':
        return NextResponse.json(
          { error: 'Aucun PIN pour cette carte. Utilisez le code SMS ou demandez un PIN à votre coopérative.', code: 'no_pin' },
          { status: 400, headers: NO_STORE },
        )
      case 'not_configured':
        return NextResponse.json(
          { error: 'La connexion par carte est indisponible pour le moment.', code: 'not_configured' },
          { status: 503, headers: NO_STORE },
        )
      default:
        return NextResponse.json(
          { error: 'Connexion impossible.', code: 'invalid' },
          { status: 400, headers: NO_STORE },
        )
    }
  }

  const response = NextResponse.json({ ok: true, expires_at: result.expiresAt.toISOString() }, { headers: NO_STORE })
  response.cookies.set(cardSessionCookieName(cardNumber), result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CARD_SESSION_TTL_SECONDS,
  })
  return response
}
