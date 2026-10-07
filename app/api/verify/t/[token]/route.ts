// Vérification publique d'une carte professionnelle par jeton opaque.
//
// GET /api/verify/t/<jeton> — le QR des nouvelles cartes encode
// https://www.faitierehub.com/verify/t/<jeton> : aucun numéro ni donnée
// personnelle dans le QR, et un renouvellement invalide l'ancien jeton.
// Même réponse que /api/verify/<numéro> pour les cartes professionnelles.

import { computeCardStatus } from '@/lib/professionals/core'
import {
  CARD_PUBLIC_COLUMNS,
  type CardRow,
  buildAgronomePublicResponse,
  fetchAgritogoHarooVerify,
} from '@/lib/professionals/server'
import { VERIFY_TOKEN_PATTERN } from '@/lib/professionals/verify-token'
import { createClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { type NextRequest, NextResponse } from 'next/server'

const notFound = async () => {
  // Délai constant : ne pas distinguer « format invalide » de « inconnu ».
  await new Promise((r) => setTimeout(r, 100))
  return NextResponse.json({ valid: false, error: 'Carte non trouvée' }, { status: 404 })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const blocked = await applyRateLimit(request, 'verify')
  if (blocked) return blocked
  const limit = rateLimit(`verify:${clientKeyFromHeaders(request.headers)}`, 10, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez dans quelques instants.' },
      { status: 429 },
    )
  }

  const { token } = await params
  if (!VERIFY_TOKEN_PATTERN.test(token)) return notFound()

  const admin = createClient()
  const { data: card, error } = await admin
    .from('member_cards')
    .select(CARD_PUBLIC_COLUMNS)
    .eq('verify_token', token)
    .is('deleted_at', null)
    .in('card_type', ['OUVRIER', 'ACHETEUR', 'AGRONOME'])
    .maybeSingle<CardRow>()
  if (error) {
    return NextResponse.json(
      { valid: false, error: 'Service temporairement indisponible' },
      { status: 503 },
    )
  }
  if (!card) return notFound()

  if (card.card_type === 'AGRONOME') {
    const payload = await buildAgronomePublicResponse(admin, card)
    return payload ? NextResponse.json(payload) : notFound()
  }

  const status = computeCardStatus(card)
  if (status === 'ACTIVE') {
    const data = await fetchAgritogoHarooVerify(card.card_number)
    if (data) return NextResponse.json(data)
  }
  return NextResponse.json({
    valid: status === 'ACTIVE',
    source: 'haroo' as const,
    card_type: card.card_type,
    card: {
      card_number: card.card_number,
      status: status.toLowerCase(),
      public_status: status,
      expiry_date: card.expiry_date,
      created_at: card.created_at,
    },
  })
}
