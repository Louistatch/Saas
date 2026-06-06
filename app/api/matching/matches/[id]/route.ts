import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_STATUSES = ['accepted', 'rejected', 'completed'] as const
type MatchStatus = (typeof VALID_STATUSES)[number]

/**
 * PATCH /api/matching/matches/[id]
 * Update match status: accepted | rejected | completed
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
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

    const { data, error } = await supabase
      .from('buyer_matches')
      .update({ status: status as MatchStatus })
      .eq('id', id)
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Match introuvable' }, { status: 404 })
    }

    return NextResponse.json({ match: data })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
