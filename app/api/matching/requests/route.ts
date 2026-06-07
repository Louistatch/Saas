import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rankListings } from '@/lib/matching/engine'
import type { ListingSummary } from '@/lib/matching/engine'

/**
 * GET /api/matching/requests
 * List open buyer requests with match counts.
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('buyer_requests')
      .select(
        'id, buyer_name, buyer_phone, buyer_email, culture, quantity_kg_needed, max_price_per_kg_fcfa, quality_grade_min, location_prefecture, needed_by, status, notes, created_at, cooperative_id, buyer_matches(id)',
      )
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    const requests = (data ?? []).map((r) => ({
      ...r,
      match_count: Array.isArray(r.buyer_matches) ? r.buyer_matches.length : 0,
      buyer_matches: undefined,
    }))

    return NextResponse.json({ requests })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

/**
 * POST /api/matching/requests
 * Create a buyer request and auto-run matching against active listings.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const body: unknown = await request.json()
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Corps invalide' }, { status: 400 })
    }

    const {
      buyer_name,
      buyer_phone,
      buyer_email,
      culture,
      quantity_kg_needed,
      max_price_per_kg_fcfa,
      quality_grade_min,
      location_prefecture,
      needed_by,
      notes,
      cooperative_id,
    } = body as Record<string, unknown>

    if (!buyer_name || !culture || !quantity_kg_needed) {
      return NextResponse.json(
        { error: 'buyer_name, culture et quantity_kg_needed sont obligatoires' },
        { status: 400 },
      )
    }

    const { data: newRequest, error: insertError } = await supabase
      .from('buyer_requests')
      .insert({
        buyer_name: String(buyer_name),
        buyer_phone: buyer_phone ? String(buyer_phone) : null,
        buyer_email: buyer_email ? String(buyer_email) : null,
        culture: String(culture),
        quantity_kg_needed: Number(quantity_kg_needed),
        max_price_per_kg_fcfa: max_price_per_kg_fcfa != null ? Number(max_price_per_kg_fcfa) : null,
        quality_grade_min: quality_grade_min ? String(quality_grade_min) : null,
        location_prefecture: location_prefecture ? String(location_prefecture) : null,
        needed_by: needed_by ? String(needed_by) : null,
        notes: notes ? String(notes) : null,
        cooperative_id: cooperative_id ? String(cooperative_id) : null,
        status: 'open',
      })
      .select()
      .single()

    if (insertError || !newRequest) {
      return NextResponse.json({ error: insertError?.message ?? 'Erreur création' }, { status: 400 })
    }

    // Auto-run matching: fetch active listings for same culture
    const { data: listings } = await supabase
      .from('market_listings')
      .select('id, culture, quantity_kg, price_per_kg_fcfa, quality_grade, location_prefecture, cooperatives(name)')
      .eq('culture', String(culture))
      .eq('status', 'active')

    const listingSummaries: ListingSummary[] = (listings ?? []).map((l) => ({
      id: l.id as string,
      culture: l.culture as string,
      quantity_kg: l.quantity_kg as number,
      price_per_kg_fcfa: l.price_per_kg_fcfa as number,
      quality_grade: l.quality_grade as string,
      location_prefecture: l.location_prefecture as string | null,
      cooperative_name: (l.cooperatives as unknown as { name: string } | null)?.name ?? null,
    }))

    const ranked = rankListings(listingSummaries, {
      culture: String(culture),
      quantity_kg_needed: Number(quantity_kg_needed),
      max_price_per_kg_fcfa: max_price_per_kg_fcfa != null ? Number(max_price_per_kg_fcfa) : null,
      quality_grade_min: quality_grade_min ? String(quality_grade_min) : null,
      location_prefecture: location_prefecture ? String(location_prefecture) : null,
    })

    const top5 = ranked.slice(0, 5)

    if (top5.length > 0) {
      await supabase.from('buyer_matches').insert(
        top5.map((m) => ({
          request_id: newRequest.id as string,
          listing_id: m.listing_id,
          match_score: m.score,
          match_reason: m.reasons.join(', '),
          status: 'proposed',
        })),
      )

      // Notify matched parties via notification_queue (fire-and-forget)
      void Promise.resolve(supabase.from('notification_queue').insert(
        top5.map((m) => ({
          type: 'match_found',
          cooperative_id: cooperative_id ? String(cooperative_id) : null,
          payload: { match_id: m.listing_id ?? null, request_id: newRequest.id ?? null },
          status: 'pending',
          attempts: 0,
        }))
      )).catch(() => null)
    }

    return NextResponse.json(
      { request: newRequest, matches_found: top5.length },
      { status: 201 },
    )
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
