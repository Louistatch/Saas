/**
 * GET /api/technicien/[card_number]
 *
 * Returns the contacts a producer may call from the verify page:
 *   1. The technician of THEIR canton, within THEIR faîtière only.
 *   2. The SE/Coordonnateur of THEIR faîtière.
 *
 * Business rule (enforced server-side): a cooperative can only reach a
 * technician of its OWN faîtière. The faîtière + canton are derived from the
 * scanned card, never from client input.
 *
 * Public route (verify is anon) — rate limited.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'

interface Contact {
  role: 'technicien' | 'coordo'
  name: string
  phone: string
  canton?: string | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ card_number: string }> },
) {
  const blocked = await applyRateLimit(request, 'verify')
  if (blocked) return blocked

  const { card_number } = await params
  const cardNumber = decodeURIComponent(card_number).trim().toUpperCase()
  if (!/^[A-Z]{2,5}-\d{4,6}$/.test(cardNumber)) {
    return NextResponse.json({ error: 'Numéro de carte invalide' }, { status: 400 })
  }

  const supabase = await createClient()

  // 1. Resolve the card → cooperative.
  const { data: card } = await supabase
    .from('member_cards')
    .select('member_id, cooperative_id, status')
    .eq('card_number', cardNumber)
    .eq('status', 'active')
    .maybeSingle()

  if (!card) {
    return NextResponse.json({ contacts: [] })
  }

  // 2. Resolve the producer's canton_id (from the member, fallback to coop).
  const { data: member } = await supabase
    .from('members')
    .select('canton_id')
    .eq('id', card.member_id)
    .maybeSingle()

  // 3. Resolve the cooperative → its faîtière (root of the hierarchy) + canton fallback.
  const { data: coop } = await supabase
    .from('cooperatives')
    .select('id, parent_id, level, canton_id, faitiere_name')
    .eq('id', card.cooperative_id)
    .maybeSingle()

  if (!coop) return NextResponse.json({ contacts: [] })

  const cantonId = member?.canton_id ?? coop.canton_id ?? null

  // Walk up parent_id until we reach the faîtière (level = 'faitiere').
  let faitiereId = coop.level === 'faitiere' ? coop.id : null
  let parentId = coop.parent_id
  let guard = 0
  while (!faitiereId && parentId && guard < 6) {
    guard++
    const { data: parent } = await supabase
      .from('cooperatives')
      .select('id, parent_id, level')
      .eq('id', parentId)
      .maybeSingle()
    if (!parent) break
    if (parent.level === 'faitiere') {
      faitiereId = parent.id
      break
    }
    parentId = parent.parent_id
  }

  const contacts: Contact[] = []

  if (faitiereId) {
    // 4a. Technician of the producer's canton, within their faîtière ONLY.
    if (cantonId) {
      const { data: tech } = await supabase
        .from('techniciens')
        .select('name, phone, canton:cantons(name)')
        .eq('faitiere_id', faitiereId)
        .eq('canton_id', cantonId)
        .maybeSingle()
      if (tech) {
        const cantonName = Array.isArray(tech.canton)
          ? (tech.canton[0] as { name?: string } | undefined)?.name
          : (tech.canton as { name?: string } | null)?.name
        contacts.push({
          role: 'technicien',
          name: tech.name,
          phone: tech.phone,
          canton: cantonName ?? null,
        })
      }
    }

    // 4b. SE/Coordonnateur of the producer's faîtière.
    const { data: faitiere } = await supabase
      .from('cooperatives')
      .select('coordo_name, coordo_phone')
      .eq('id', faitiereId)
      .maybeSingle()
    if (faitiere?.coordo_phone) {
      contacts.push({
        role: 'coordo',
        name: faitiere.coordo_name ?? 'SE / Coordonnateur',
        phone: faitiere.coordo_phone,
      })
    }
  }

  return NextResponse.json({ contacts })
}
