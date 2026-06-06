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
    .select('member_id')
    .eq('card_number', cardNumber)
    .eq('status', 'active')
    .maybeSingle()

  if (!card?.member_id) {
    return NextResponse.json({ error: 'Carte non trouvée.' }, { status: 404 })
  }

  const { data: intrants } = await supabase
    .from('intrants')
    .select('id, name, type, quantity, unit, cost_fcfa, purchase_date, supplier')
    .eq('member_id', card.member_id)
    .order('purchase_date', { ascending: false })
    .limit(30)

  return NextResponse.json({ intrants: intrants ?? [] })
}
