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

  // Find card → cooperative_id + member_id
  const { data: card } = await supabase
    .from('member_cards')
    .select('member_id, cooperative_id')
    .eq('card_number', cardNumber)
    .eq('status', 'active')
    .maybeSingle()

  if (!card?.cooperative_id) {
    return NextResponse.json({ fiches: [], cooperative_name: null }, { status: 200 })
  }

  const admin = createAdminClient()

  // Get the coop + its parent (faitière) to include parent fiches too
  const { data: coop } = await admin
    .from('cooperatives')
    .select('id, name, parent_id, level')
    .eq('id', card.cooperative_id)
    .maybeSingle()

  // Collect all cooperative IDs to search fiches for:
  // own coop + parent (faitière/union) if exists
  const coopIds = [card.cooperative_id]
  if (coop?.parent_id) coopIds.push(coop.parent_id)

  const { data: fiches } = await admin
    .from('fiches_techniques')
    .select('id, title, description, culture, type_agriculture, campaign, price_non_member, is_free_for_members, download_count, files, created_at, cooperative_id, cooperatives(name)')
    .in('cooperative_id', coopIds)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json(
    {
      fiches: fiches ?? [],
      cooperative_name: coop?.name ?? null,
      cooperative_level: coop?.level ?? null,
    },
    { headers: { 'Cache-Control': 'private, max-age=120, stale-while-revalidate=300' } },
  )
}
