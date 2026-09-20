import { assertTenantAccess } from '@/lib/security/assert-access'
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

const VALID_STATUSES = ['accepted', 'rejected', 'completed'] as const
type MatchStatus = (typeof VALID_STATUSES)[number]

/**
 * PATCH /api/matching/matches/[id]
 * Update match status. Auth required + ownership verified via buyer_request.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const body: unknown = await request.json()
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Corps invalide' }, { status: 400 })
    }

    const { status } = body as Record<string, unknown>

    if (!status || !VALID_STATUSES.includes(status as MatchStatus)) {
      return NextResponse.json(
        { error: `Statut invalide. Valeurs acceptées: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      )
    }

    // Vérification propriété : récupérer le match + sa requête + la coopérative
    const { data: match, error: matchFetchError } = await supabase
      .from('buyer_matches')
      .select('id, request_id, buyer_requests(cooperative_id, created_by)')
      .eq('id', id)
      .single()

    if (matchFetchError || !match) {
      return NextResponse.json({ error: 'Match introuvable' }, { status: 404 })
    }

    const owner = match.buyer_requests as unknown as {
      cooperative_id: string | null
      created_by: string | null
    } | null
    if (owner?.created_by !== user.id) {
      const access = owner?.cooperative_id ? await assertTenantAccess(owner.cooperative_id) : null
      if (profile.role !== 'super_admin' && !access?.ok) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
      }
    }

    const { data, error } = await supabase
      .from('buyer_matches')
      .update({ status: status as MatchStatus })
      .eq('id', id)
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Erreur mise à jour' }, { status: 400 })
    }

    return NextResponse.json({ match: data })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
