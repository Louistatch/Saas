import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
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

  // Use admin client to bypass RLS for member data reads
  const supabaseAdmin = createAdminClient()
  const { data: intrants } = await supabaseAdmin
    .from('intrants')
    .select('id, name, type, quantity, unit, cost_fcfa, purchase_date, supplier')
    .eq('member_id', card.member_id)
    .order('purchase_date', { ascending: false })
    .limit(30)

  return NextResponse.json({ intrants: intrants ?? [] })
}
