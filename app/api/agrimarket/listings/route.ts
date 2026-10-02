import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'

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
  // Liste blanche : un `?status=` vide ne doit pas faire sauter le filtre et
  // renvoyer toutes les annonces, quel que soit leur état.
  const requestedStatus = searchParams.get('status')
  const status = ['active', 'sold', 'expired', 'cancelled'].includes(requestedStatus ?? '')
    ? (requestedStatus as string)
    : 'active'
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1'))
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

    query = query.eq('status', status)
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
  const blocked = await applyRateLimit(request, 'marketplace')
  if (blocked) return blocked

  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Get user's cooperative and member record
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, cooperative_id')
      .eq('id', user.id)
      .single<{ role: string; cooperative_id: string | null }>()

    if (!profile?.cooperative_id) {
      return NextResponse.json({ error: 'Coopérative introuvable' }, { status: 400 })
    }

    const body = await request.json()
    const {
      culture,
      quantity_kg,
      price_per_kg_fcfa,
      quality_grade = 'B',
      harvest_date_estimated,
      location_canton,
      description,
      member_id: requestedMemberId,
    } = body

    if (!culture || !quantity_kg || !price_per_kg_fcfa) {
      return NextResponse.json({ error: 'Culture, quantité et prix sont obligatoires' }, { status: 400 })
    }

    // La vente appartient à LA PERSONNE qui vend, pas au premier membre venu de
    // la coopérative : fiche rattachée au compte par l'e-mail. Un administrateur
    // peut vendre pour un membre de sa coopérative en le désignant.
    const isAdmin = profile.role === 'cooperative_admin' || profile.role === 'super_admin'
    let memberId: string | null = null
    if (user.email) {
      const { data: own } = await supabase
        .from('members')
        .select('id')
        .eq('cooperative_id', profile.cooperative_id)
        .ilike('email', user.email)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle<{ id: string }>()
      memberId = own?.id ?? null
    }
    if (isAdmin && typeof requestedMemberId === 'string') {
      const { data: target } = await supabase
        .from('members')
        .select('id')
        .eq('id', requestedMemberId)
        .eq('cooperative_id', profile.cooperative_id)
        .is('deleted_at', null)
        .maybeSingle<{ id: string }>()
      if (!target) {
        return NextResponse.json({ error: 'Membre introuvable dans votre coopérative' }, { status: 400 })
      }
      memberId = target.id
    }
    if (!memberId) {
      // Un administrateur peut vendre pour un membre : l'écran propose alors le choix.
      if (isAdmin) {
        return NextResponse.json(
          { error: 'Choisissez le membre pour qui vous vendez.', needs_member: true },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { error: "Aucune fiche membre n'est rattachée à votre compte. Contactez votre coopérative." },
        { status: 403 },
      )
    }

    const { data, error } = await supabase
      .from('market_listings')
      .insert({
        member_id: memberId,
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
