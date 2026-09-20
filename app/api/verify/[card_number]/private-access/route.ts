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
  return NextResponse.json({ allowed: true }, { headers: { 'Cache-Control': 'no-store' } })
}
