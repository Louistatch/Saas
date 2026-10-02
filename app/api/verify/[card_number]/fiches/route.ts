import { requirePrivateCard } from '@/lib/security/card-access'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ card_number: string }> },
) {
  const { card_number } = await params
  const cardNumber = decodeURIComponent(card_number).toUpperCase().trim()

  const access = await requirePrivateCard(cardNumber)
  if (!access.ok) return access.response
  const { card, supabase } = access

  if (!card?.cooperative_id) {
    return NextResponse.json({ fiches: [], cooperative_name: null }, { status: 200 })
  }

  const admin = supabase

  // La coopérative, puis toute sa chaîne d'ancêtres (union, faîtière) : les
  // fiches sont publiées à n'importe quel niveau. Chaîne bornée à 6 niveaux, et
  // coupée si elle boucle.
  interface CoopNode {
    id: string
    name: string
    parent_id: string | null
    level: string | null
  }
  const chain: CoopNode[] = []
  let cursor: string | null = card.cooperative_id as string | null
  while (cursor && chain.length < 6 && !chain.some((c) => c.id === cursor)) {
    const { data: row } = await admin
      .from('cooperatives')
      .select('id, name, parent_id, level')
      .eq('id', cursor)
      .maybeSingle<CoopNode>()
    if (!row) break
    chain.push(row)
    cursor = row.parent_id
  }
  const coop = chain[0] ?? null
  const coopIds = chain.length ? chain.map((c) => c.id) : [card.cooperative_id]

  // Qui publie : la faîtière si la chaîne en contient une, sinon le niveau
  // juste au-dessus (ex. une union), sinon rien.
  const publisher = chain.slice(1).find((c) => c.level === 'faitiere') ?? chain[1] ?? null
  const faitiereName: string | null = publisher?.name ?? null

  const { data: fiches } = await admin
    .from('fiches_techniques')
    .select(
      'id, title, description, culture, type_agriculture, campaign, price_non_member, is_free_for_members, download_count, files, created_at, cooperative_id, cooperatives(name)',
    )
    .in('cooperative_id', coopIds)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json(
    {
      fiches: fiches ?? [],
      faitiere_name: faitiereName,
      cooperative_name: coop?.name ?? null,
      cooperative_level: coop?.level ?? null,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
