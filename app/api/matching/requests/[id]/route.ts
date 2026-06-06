import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/matching/requests/[id]
 * Fetch a buyer request and all its matches with listing details.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: buyerRequest, error: reqError } = await supabase
      .from('buyer_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (reqError || !buyerRequest) {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
    }

    const { data: matches, error: matchError } = await supabase
      .from('buyer_matches')
      .select(
        'id, match_score, match_reason, status, created_at, listing_id, market_listings(id, culture, quantity_kg, price_per_kg_fcfa, quality_grade, location_prefecture, location_canton, status, cooperative_id, cooperatives(name))',
      )
      .eq('request_id', id)
      .order('match_score', { ascending: false })

    if (matchError) {
      return NextResponse.json({ error: 'Erreur chargement matches' }, { status: 500 })
    }

    return NextResponse.json({ request: buyerRequest, matches: matches ?? [] })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
