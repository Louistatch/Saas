/**
 * PATCH /api/verify/[card_number]/listings/[id] — clore une vente AgriMarket.
 *
 * Body : { status: 'sold' | 'cancelled' }. On ne supprime pas : le producteur
 * garde l'historique de ce qu'il a mis en vente.
 *
 * ⚠️ Avec une session de carte, `supabase` est le client de service (voir
 * requirePrivateCard). La clause `.eq('member_id', card.member_id)` est donc ce
 * qui empêche de clore la vente d'un autre membre en connaissant son id.
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
  if (!UUID.test(id)) return NextResponse.json({ error: 'Vente invalide' }, { status: 400 })

  const access = await requirePrivateCard(decodeURIComponent(card_number))
  if (!access.ok) return access.response
  const { card, supabase } = access
  if (!card?.member_id) return NextResponse.json({ error: 'Carte non trouvée.' }, { status: 404 })

  const body = (await request.json().catch(() => null)) as { status?: string } | null
  if (body?.status !== 'sold' && body?.status !== 'cancelled') {
    return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('market_listings')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('member_id', card.member_id)
    .eq('status', 'active')
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.code === '42501') {
      return NextResponse.json({ error: 'Vous ne pouvez pas modifier cette vente.' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Modification impossible' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Vente introuvable ou déjà close' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
