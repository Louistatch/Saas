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
  const { data: parcelles } = await supabaseAdmin
    .from('parcelles')
    .select('name, culture_principale, culture_name, superficie_ha, surface_ha, soil_type, irrigation_type, gps_coordinates, campaign_year, source, created_at')
    .eq('member_id', card.member_id)
    .order('created_at', { ascending: false })

  const list = parcelles ?? []
  const total_ha = list.reduce((s, p) => s + (p.superficie_ha ?? p.surface_ha ?? 0), 0)
  const cultures = [...new Set(list.map((p) => p.culture_principale ?? p.culture_name).filter(Boolean))]

  return NextResponse.json({ parcelles: list, total_ha, cultures })
}
