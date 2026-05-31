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

/**
 * Expand O↔0 and I↔1 ambiguous variants (same logic as verify route).
 * Ensures that a card found via variant matching in verify can also be
 * resolved here for technician lookup.
 */
function expandAmbiguousVariants(prefix: string): string[] {
  const PAIRS: Record<string, string> = { O: '0', '0': 'O', I: '1', '1': 'I' }
  let variants = [prefix]
  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i]
    const alt = PAIRS[ch]
    if (!alt) continue
    const next: string[] = []
    for (const v of variants) {
      next.push(v)
      next.push(v.slice(0, i) + alt + v.slice(i + 1))
    }
    variants = next
    if (variants.length > 32) break
  }
  return [...new Set(variants)]
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ card_number: string }> },
) {
  try {
    const blocked = await applyRateLimit(request, 'verify')
    if (blocked) return blocked

    const { card_number } = await params
    const cardNumber = decodeURIComponent(card_number).trim().toUpperCase()

    // Accept digits in prefix too (O↔0, I↔1 confusion from QR scan)
    if (!/^[A-Z0-9]{2,5}-\d{4,6}$/.test(cardNumber)) {
      return NextResponse.json({ error: 'Numéro de carte invalide' }, { status: 400 })
    }

    const supabase = await createClient()

    // Build variant list for O↔0 / I↔1 matching (consistent with verify route)
    const [prefix, suffix] = cardNumber.split('-')
    const variants = expandAmbiguousVariants(prefix).map((p) => `${p}-${suffix}`)

    // 1. Resolve the card → cooperative (using variant matching).
    const { data: card } = await supabase
      .from('member_cards')
      .select('member_id, cooperative_id, status')
      .in('card_number', variants)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (!card) {
      return NextResponse.json({ contacts: [] })
    }

    // 2. Resolve the producer's canton_id (from the member, fallback to coop).
    //    If canton_id is null, we'll try matching by canton text name later.
    const { data: member } = await supabase
      .from('members')
      .select('canton_id, canton')
      .eq('id', card.member_id)
      .maybeSingle()

    // 3. Resolve the cooperative → its faîtière (root of the hierarchy) + canton fallback.
    const { data: coop } = await supabase
      .from('cooperatives')
      .select('id, parent_id, level, faitiere_name')
      .eq('id', card.cooperative_id)
      .maybeSingle()

    if (!coop) return NextResponse.json({ contacts: [] })

    const cantonId = member?.canton_id ?? null
    const cantonText = member?.canton ?? null  // fallback for text-based matching

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
      //     Primary: match by canton_id (UUID).
      //     Fallback: if canton_id is null, match by canton text name (for members
      //     imported from Kobo without proper canton_id linkage).
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
      } else if (cantonText) {
        // Fallback: resolve canton_id from the text name, then find the technician.
        const { data: cantonRow } = await supabase
          .from('cantons')
          .select('id, name')
          .ilike('name', cantonText.trim())
          .maybeSingle()
        if (cantonRow) {
          const { data: tech } = await supabase
            .from('techniciens')
            .select('name, phone')
            .eq('faitiere_id', faitiereId)
            .eq('canton_id', cantonRow.id)
            .maybeSingle()
          if (tech) {
            contacts.push({
              role: 'technicien',
              name: tech.name,
              phone: tech.phone,
              canton: cantonRow.name,
            })
          }
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
  } catch (error) {
    console.error('[technicien] Unhandled error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', contacts: [] },
      { status: 500 }
    )
  }
}
