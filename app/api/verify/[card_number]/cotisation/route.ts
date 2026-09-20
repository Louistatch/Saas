import { NextResponse, type NextRequest } from 'next/server'
import { requirePrivateCard } from '@/lib/security/card-access'
import { rateLimit, clientKeyFromHeaders } from '@/lib/utils/rate-limit'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ card_number: string }> }
) {
  const blocked = await applyRateLimit(request, 'verify')
  if (blocked) return blocked

  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`verify:${ip}`, 10, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez dans quelques instants.' },
      { status: 429 }
    )
  }

  const { card_number } = await params
  const cardNumber = decodeURIComponent(card_number).toUpperCase().trim()

  const access = await requirePrivateCard(cardNumber)
  if (!access.ok) return access.response
  const { card, supabase } = access

  if (!card?.member_id) {
    return NextResponse.json({ error: 'Carte non trouvée.' }, { status: 404 })
  }

  // Keep the authenticated RLS scope for private data.
  const supabaseAdmin = supabase
  const { data: cotisations } = await supabaseAdmin
    .from('cotisations')
    .select('id, campaign, status, amount, currency, type, due_date, paid_date, notes, created_at')
    .eq('member_id', card.member_id)
    .order('created_at', { ascending: false })
    .limit(10)

  const last = cotisations?.[0] ?? null
  const status = last?.status ?? null
  const isPaid = status === 'paid' || status === 'waived'
  const isOverdue = status === 'overdue' || (status === 'pending' && last?.due_date && new Date(last.due_date) < new Date())

  return NextResponse.json({
    cotisations: cotisations ?? [],
    summary: {
      last_campaign: last?.campaign ?? null,
      last_status: last?.status ?? null,
      last_amount: last?.amount ?? null,
      currency: last?.currency ?? 'XOF',
      is_paid: isPaid,
      is_overdue: isOverdue,
      due_date: last?.due_date ?? null,
      paid_date: last?.paid_date ?? null,
    },
  })
}
