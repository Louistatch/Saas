import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * PATCH /api/agrimarket/listings/[id]
 * Update listing status or fields. Auth required + ownership verified.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
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

    // Vérification propriété : la annonce doit appartenir à la coopérative de l'utilisateur
    // (sauf super_admin qui a accès global)
    const { data: listing, error: fetchError } = await supabase
      .from('market_listings')
      .select('id, cooperative_id')
      .eq('id', id)
      .single()

    if (fetchError || !listing) {
      return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
    }

    const isSuperAdmin = profile.role === 'super_admin'
    const isOwner = listing.cooperative_id === profile.cooperative_id

    if (!isSuperAdmin && !isOwner) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json()
    const allowed = ['status', 'quantity_kg', 'price_per_kg_fcfa', 'description', 'location_canton']
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    const { data, error } = await supabase
      .from('market_listings')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ listing: data })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

/**
 * DELETE /api/agrimarket/listings/[id]
 * Delete a listing. Auth required + ownership verified.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
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

    // Vérification propriété avant suppression
    const { data: listing, error: fetchError } = await supabase
      .from('market_listings')
      .select('id, cooperative_id')
      .eq('id', id)
      .single()

    if (fetchError || !listing) {
      return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
    }

    const isSuperAdmin = profile.role === 'super_admin'
    const isOwner = listing.cooperative_id === profile.cooperative_id

    if (!isSuperAdmin && !isOwner) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { error } = await supabase
      .from('market_listings')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
