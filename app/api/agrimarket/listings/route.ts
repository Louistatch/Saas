import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/agrimarket/listings
 * List market listings with optional filters.
 * Params: cooperative_id, culture, status, page
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const cooperativeId = searchParams.get('cooperative_id')
  const memberId = searchParams.get('member_id')
  const culture = searchParams.get('culture')
  const status = searchParams.get('status') ?? 'active'
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const pageSize = 50

  try {
    const supabase = await createClient()

    let query = supabase
      .from('market_listings')
      .select(
        'id, culture, quantity_kg, price_per_kg_fcfa, quality_grade, harvest_date_estimated, location_canton, location_prefecture, description, status, views_count, contact_count, expires_at, created_at, member_id, cooperative_id, cooperatives(name), members(first_name, last_name)',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (cooperativeId) query = query.eq('cooperative_id', cooperativeId)
    if (memberId) query = query.eq('member_id', memberId)
    if (culture) query = query.eq('culture', culture)

    const from = (page - 1) * pageSize
    query = query.range(from, from + pageSize - 1)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json({ listings: data ?? [], total: count ?? 0, page, pageSize })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

/**
 * POST /api/agrimarket/listings
 * Create a new listing. Auth required.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Get user's cooperative and member record
    const { data: profile } = await supabase
      .from('profiles')
      .select('cooperative_id')
      .eq('id', user.id)
      .single()

    if (!profile?.cooperative_id) {
      return NextResponse.json({ error: 'Coopérative introuvable' }, { status: 400 })
    }

    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('cooperative_id', profile.cooperative_id)
      .limit(1)
      .single()

    const body = await request.json()
    const {
      culture,
      quantity_kg,
      price_per_kg_fcfa,
      quality_grade = 'B',
      harvest_date_estimated,
      location_canton,
      description,
    } = body

    if (!culture || !quantity_kg || !price_per_kg_fcfa) {
      return NextResponse.json({ error: 'Culture, quantité et prix sont obligatoires' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('market_listings')
      .insert({
        member_id: member?.id ?? user.id,
        cooperative_id: profile.cooperative_id,
        culture,
        quantity_kg: Number(quantity_kg),
        price_per_kg_fcfa: Number(price_per_kg_fcfa),
        quality_grade,
        harvest_date_estimated: harvest_date_estimated || null,
        location_canton: location_canton || null,
        description: description || null,
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ listing: data }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
