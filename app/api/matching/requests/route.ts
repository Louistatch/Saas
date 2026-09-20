import { rankListings } from '@/lib/matching/engine'
import type { ListingSummary } from '@/lib/matching/engine'
import { assertTenantAccess } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/matching/requests
 * List open buyer requests with match counts.
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    let query = supabase
      .from('buyer_requests')
      .select(
        'id, buyer_name, buyer_phone, buyer_email, culture, quantity_kg_needed, max_price_per_kg_fcfa, quality_grade_min, location_prefecture, needed_by, status, notes, created_at, cooperative_id, buyer_matches(id)',
      )
      .order('created_at', { ascending: false })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.role !== 'super_admin') {
      const { data: ids } =
        profile?.role === 'cooperative_admin'
          ? await supabase.rpc('get_accessible_cooperative_ids')
          : { data: [] }
      query =
        Array.isArray(ids) && ids.length
          ? query.or(`created_by.eq.${user.id},cooperative_id.in.(${ids.join(',')})`)
          : query.eq('created_by', user.id)
    }

    const { data, error } = await query

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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
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

    if (cooperative_id) {
      if (typeof cooperative_id !== 'string')
        return NextResponse.json({ error: 'Organisation invalide' }, { status: 400 })
      const access = await assertTenantAccess(cooperative_id)
      if (!access.ok) return access.response
    }
    if (!Number.isFinite(Number(quantity_kg_needed)) || Number(quantity_kg_needed) <= 0) {
      return NextResponse.json({ error: 'Quantité invalide' }, { status: 400 })
    }

    const { data: newRequest, error: insertError } = await supabase
      .from('buyer_requests')
      .insert({
        created_by: user.id,
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
      return NextResponse.json(
        { error: insertError?.message ?? 'Erreur création' },
        { status: 400 },
      )
    }

    // Auto-run matching: fetch active listings for same culture
    const { data: listings } = await supabase
      .from('market_listings')
      .select(
        'id, culture, quantity_kg, price_per_kg_fcfa, quality_grade, location_prefecture, cooperative_id, cooperatives(name)',
      )
      .eq('culture', String(culture))
      .eq('status', 'active')

    const listingCooperativeIds = new Map<string, string>(
      (listings ?? [])
        .filter((l) => l.cooperative_id)
        .map((l) => [l.id as string, l.cooperative_id as string]),
    )

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
      const admin = createAdminClient()
      const { error: matchingError } = await admin.from('buyer_matches').insert(
        top5.map((m) => ({
          request_id: newRequest.id as string,
          listing_id: m.listing_id,
          match_score: m.score,
          match_reason: m.reasons.join(', '),
          status: 'proposed',
        })),
      )

      if (matchingError) {
        console.error('[matching] Match persistence failed')
        return NextResponse.json(
          {
            request: newRequest,
            matches_found: 0,
            warning: 'Demande enregistrée, rapprochement à réessayer',
          },
          { status: 201 },
        )
      }

      // Notify the seller cooperatives behind each matched listing
      // (in-app bell notification — fire-and-forget, never blocks the response)
      const matchedCooperativeIds = [
        ...new Set(
          top5
            .map((m) => listingCooperativeIds.get(m.listing_id))
            .filter((id): id is string => !!id),
        ),
      ]
      const inAppRows = matchedCooperativeIds.map((coopId) => ({
        cooperative_id: coopId,
        title: 'Nouvelle demande acheteur',
        body: `Une demande d'achat pour ${String(culture)} correspond à une de vos annonces.`,
        type: 'info' as const,
        link: '/dashboard/matching',
      }))

      if (inAppRows.length > 0) {
        await admin.from('notifications_inapp').insert(inAppRows)
      }
    }

    return NextResponse.json({ request: newRequest, matches_found: top5.length }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
