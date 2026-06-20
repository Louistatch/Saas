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

  // Use admin client to bypass RLS for member data reads
  const supabaseAdmin = createAdminClient()
  const { data: parcelles } = await supabaseAdmin
    .from('parcelles')
    .select('name, culture_principale, culture_name, superficie_ha, surface_ha, soil_type, irrigation_type, gps_coordinates, campaign_year, source, created_at')
    .eq('member_id', card.member_id)
    .order('created_at', { ascending: false })

  const list = parcelles ?? []
  const total_ha = list.reduce((s, p) => s + (p.superficie_ha ?? p.surface_ha ?? 0), 0)
  const cultures = [...new Set(list.map((p) => p.culture_principale ?? p.culture_name).filter(Boolean))]

  return NextResponse.json(
    { parcelles: list, total_ha, cultures },
    { headers: { 'Cache-Control': 'private, max-age=120, stale-while-revalidate=300' } },
  )
}
