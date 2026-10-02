import { requestCardLoginCode } from '@/lib/security/card-login'
import { clientKeyFromHeaders } from '@/lib/utils/rate-limit'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/auth/card/request — envoie un code de connexion par SMS au
 * téléphone enregistré pour la carte.
 *
 * Aucun chiffre du numéro de téléphone n'est renvoyé. Le numéro de carte se lit
 * sur la page publique de scan : celui qui le saisit ici n'est pas forcément le
 * titulaire, et ne doit rien apprendre sur lui.
 */

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  const limited = await applyRateLimit(request, 'verify')
  if (limited) return limited

  const body = (await request.json().catch(() => null)) as { card_number?: unknown } | null
  if (typeof body?.card_number !== 'string') {
    return NextResponse.json({ error: 'Numéro de carte manquant.' }, { status: 400 })
  }

  const result = await requestCardLoginCode(body.card_number, clientKeyFromHeaders(request.headers))
  if (result.ok) {
    return NextResponse.json(
      { sent: true, resend_after: result.resendAfterSeconds },
      { headers: NO_STORE },
    )
  }

  switch (result.reason) {
    case 'invalid_card':
      return NextResponse.json(
        { error: 'Carte introuvable ou expirée.', code: result.reason },
        { status: 404, headers: NO_STORE },
      )
    case 'no_phone':
      return NextResponse.json(
        {
          error:
            "Aucun numéro de téléphone n'est enregistré pour cette carte. Rapprochez-vous de votre coopérative.",
          code: result.reason,
        },
        { status: 422, headers: NO_STORE },
      )
    case 'rate_limited':
      return NextResponse.json(
        {
          error: 'Trop de demandes. Patientez avant de redemander un code.',
          code: result.reason,
          retry_after: result.retryAfterSeconds ?? 60,
        },
        {
          status: 429,
          headers: { ...NO_STORE, 'Retry-After': String(result.retryAfterSeconds ?? 60) },
        },
      )
    case 'sms_failed':
      return NextResponse.json(
        { error: "Le SMS n'a pas pu être envoyé. Réessayez dans un instant.", code: result.reason },
        { status: 502, headers: NO_STORE },
      )
    default:
      return NextResponse.json(
        { error: 'La connexion par carte est indisponible pour le moment.', code: result.reason },
        { status: 503, headers: NO_STORE },
      )
  }
}
