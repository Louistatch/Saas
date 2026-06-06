import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'

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

  const supabaseAdmin = createAdminClient()

  const { data: member } = await supabaseAdmin
    .from('members')
    .select('region')
    .eq('id', card.member_id)
    .maybeSingle()

  const region = member?.region ?? null

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const dateFrom = sevenDaysAgo.toISOString().split('T')[0]

  let query = supabaseAdmin
    .from('weather_data')
    .select('date, temperature_max, temperature_min, temperature_mean, precipitation_mm, humidity_pct, wind_speed_ms, et0_mm, region')
    .gte('date', dateFrom)
    .order('date', { ascending: false })
    .limit(14)

  if (region) {
    query = query.eq('region', region)
  }

  const { data: weather } = await query

  return NextResponse.json({ weather: weather ?? [], region })
}
