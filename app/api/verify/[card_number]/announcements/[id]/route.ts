/**
 * PATCH /api/verify/[card_number]/announcements/[id] — retirer une annonce.
 *
 * On CLÔTURE (status = 'closed') au lieu de supprimer : l'annonce disparaît du
 * Marché, qui ne montre que les 'active', mais le producteur garde l'historique
 * de ce qu'il a publié. L'écran Haroo, lui, supprime définitivement ; les deux
 * choix coexistent parce qu'ils ne servent pas le même usage — ici l'annonce
 * est rattachée à une carte membre et fait partie de son exploitation.
 */

import { requirePrivateCard } from '@/lib/security/card-access'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { type NextRequest, NextResponse } from 'next/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ card_number: string; id: string }> },
) {
  const rateLimited = await applyRateLimit(request, 'verify')
  if (rateLimited) return rateLimited

  const { card_number, id } = await params
  if (!UUID.test(id)) {
    return NextResponse.json({ error: 'Annonce invalide' }, { status: 400 })
  }

  const access = await requirePrivateCard(decodeURIComponent(card_number))
  if (!access.ok) return access.response
  const { card, supabase } = access

  if (!card?.member_id) {
    return NextResponse.json({ error: 'Carte non trouvée.' }, { status: 404 })
  }

  const body = (await request.json().catch(() => null)) as { status?: string } | null
  if (body?.status !== 'closed') {
    return NextResponse.json({ error: 'Seul le retrait est possible' }, { status: 400 })
  }

  // Double verrou : la clause member_id empêche de clôturer l'annonce d'une
  // AUTRE carte en connaissant son id, et la policy RLS vérifie la propriété.
  const { data, error } = await supabase
    .from('producer_announcements')
    .update({ status: 'closed', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('member_id', card.member_id)
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.code === '42501') {
      return NextResponse.json({ error: "Vous ne pouvez pas retirer cette annonce." }, { status: 403 })
    }
    return NextResponse.json({ error: 'Retrait impossible' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
  }
  return NextResponse.json({ id: data.id, status: 'closed' })
}
