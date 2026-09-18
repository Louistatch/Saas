import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const revalidate = 300 // ISR: 5 min on CDN

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_platform_totals')

    if (error || !data || data.length === 0) {
      return NextResponse.json(
        { members: 0, cooperatives: 0, hectares: 0, cards: 0 },
        { status: 200, headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } },
      )
    }

    const row = data[0]
    return NextResponse.json(
      {
        members: row.total_members ?? 0,
        cooperatives: row.total_cooperatives ?? 0,
        hectares: row.total_exploitations ?? 0,
        cards: row.total_active_cards ?? 0,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } },
    )
  } catch {
    return NextResponse.json(
      { members: 0, cooperatives: 0, hectares: 0, cards: 0 },
      { status: 200 },
    )
  }
}
