import { cardRateLimit, requirePrivateCard } from '@/lib/security/card-access'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ card_number: string }> },
) {
  const limited = cardRateLimit(request)
  if (limited) return limited
  const { card_number } = await params
  const access = await requirePrivateCard(card_number)
  if (!access.ok) return access.response
  // `via` permet à la page de proposer « Se déconnecter » seulement quand la
  // session est une session de carte : un compte se quitte ailleurs.
  return NextResponse.json(
    { allowed: true, via: access.via },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
