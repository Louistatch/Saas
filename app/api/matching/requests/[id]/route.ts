import { assertTenantAccess } from '@/lib/security/assert-access'
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/matching/requests/[id]
 * Fetch a buyer request and all its matches with listing details.
 * Auth required — only the owning cooperative or super_admin can view.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, cooperative_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profil introuvable' }, { status: 403 })
    }

    const { data: buyerRequest, error: reqError } = await supabase
      .from('buyer_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (reqError || !buyerRequest) {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
    }

    if (buyerRequest.created_by !== user.id) {
      const access = buyerRequest.cooperative_id
        ? await assertTenantAccess(buyerRequest.cooperative_id)
        : null
      if (profile.role !== 'super_admin' && !access?.ok) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
      }
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
