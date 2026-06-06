import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ card_number: string }> }
) {
  const { card_number } = await params
  const cardNumber = decodeURIComponent(card_number).toUpperCase().trim()

  const supabase = await createClient()

  const { data: card } = await supabase
    .from('member_cards')
    .select('member_id, cooperative_id')
    .eq('card_number', cardNumber)
    .eq('status', 'active')
    .maybeSingle()

  if (!card?.member_id) {
    return NextResponse.json({ error: 'Carte non trouvée.' }, { status: 404 })
  }

  const { data: cotisations } = await supabase
    .from('cotisations')
    .select('id, campaign, status, amount, currency, type, due_date, paid_date, notes, created_at')
    .eq('member_id', card.member_id)
    .order('created_at', { ascending: false })
    .limit(10)

  const last = cotisations?.[0] ?? null
  const isPaid = last?.status === 'paid'
  const isOverdue = last?.status === 'pending' && last?.due_date && new Date(last.due_date) < new Date()

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
