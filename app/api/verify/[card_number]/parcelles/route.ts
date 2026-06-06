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

  const { data: parcelles } = await supabase
    .from('parcelles')
    .select('name, culture_principale, superficie_ha, created_at')
    .eq('member_id', card.member_id)
    .order('created_at', { ascending: false })

  const total_ha = (parcelles ?? []).reduce((s, p) => s + (p.superficie_ha ?? 0), 0)

  return NextResponse.json({ parcelles: parcelles ?? [], total_ha })
}
