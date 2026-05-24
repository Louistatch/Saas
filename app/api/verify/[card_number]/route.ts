// [SECURITY FIX - FORGE-001 - Sous-étape B]
// Route API serveur pour la vérification de carte — utilise la vue restrictive uniquement.
// Empêche l'énumération en validant le format et en appliquant un délai constant.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { rateLimit, clientKeyFromHeaders } from '@/lib/utils/rate-limit'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'

/**
 * Génère toutes les variantes O↔0 et I↔1 du préfixe.
 * Permet de retrouver une carte même si l'utilisateur a saisi `C00` au lieu de `COO`
 * (confusion visuelle classique entre la lettre O et le chiffre 0).
 *
 * Limite à 32 variantes max pour éviter l'explosion combinatoire sur des préfixes
 * avec beaucoup de caractères ambigus.
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
  { params }: { params: Promise<{ card_number: string }> }
) {
  const { card_number } = await params

  // [SECURITY FIX - GHOST-003] Rate limiting persistant via Upstash (si configuré)
  const blocked = await applyRateLimit(request, 'verify')
  if (blocked) return blocked

  // Rate limiting par IP — 10 vérifications / minute (fallback in-memory)
  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`verify:${ip}`, 10, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez dans quelques instants.' },
      { status: 429 }
    )
  }

  // Décoder le numéro de carte (support legacy QR format)
  let decodedCardNumber = decodeURIComponent(card_number)

  // Legacy QR format: extraire le numéro de carte si format JSON fragmenté
  if (decodedCardNumber.includes('"') || decodedCardNumber.includes('{') || decodedCardNumber.includes(',')) {
    const cardMatch = decodedCardNumber.match(/^([A-Z]{2,5}-\d{4,6})/)
    if (cardMatch) {
      decodedCardNumber = cardMatch[1]
    } else {
      decodedCardNumber = decodedCardNumber.split(/[",{]/)[0].trim()
    }
  }

  // Normaliser : majuscules + retirer espaces
  decodedCardNumber = decodedCardNumber.toUpperCase().trim()

  // Validation du format de carte — accepte aussi les chiffres dans le préfixe pour
  // gérer les confusions visuelles O↔0 et I↔1 lors de la saisie manuelle
  const lenientSchema = z.string().regex(/^[A-Z0-9]{2,5}-\d{4,6}$/, 'Format invalide')
  const parsed = lenientSchema.safeParse(decodedCardNumber)
  if (!parsed.success) {
    // Même délai que la réponse normale pour éviter le timing attack
    await new Promise(r => setTimeout(r, 100))
    return NextResponse.json({ valid: false, error: 'Carte non trouvée' }, { status: 404 })
  }

  const supabase = await createClient()

  // Construire la liste des variantes possibles (O↔0, I↔1) du préfixe.
  // Limite à 16 variantes max (4 caractères ambigus = 2^4) pour éviter l'explosion combinatoire.
  const [prefix, suffix] = parsed.data.split('-')
  const variants = expandAmbiguousVariants(prefix).map((p) => `${p}-${suffix}`)

  // Appel de la RPC verify_card (SECURITY DEFINER) — contourne les REVOKE anon
  // sur les tables members/cooperatives. La fonction n'expose que les champs publics.
  const { data: rows, error } = await supabase
    .rpc('verify_card', { p_card_numbers: variants })

  const data = Array.isArray(rows) ? rows[0] : null

  if (error || !data) {
    await new Promise(r => setTimeout(r, 100)) // Timing-safe
    return NextResponse.json({ valid: false, error: 'Carte non trouvée' }, { status: 404 })
  }

  // Vérifier l'expiration
  const isExpired = data.expiry_date && new Date(data.expiry_date) < new Date()
  const isActive = data.card_status === 'active' && !isExpired

  return NextResponse.json({
    valid: isActive,
    card: {
      card_number: data.card_number,
      status: isActive ? 'active' : (isExpired ? 'expired' : data.card_status),
      expiry_date: data.expiry_date,
      created_at: data.card_created_at,
    },
    member: {
      first_name: data.first_name,
      last_name: data.last_name,
      photo_url: data.photo_url ?? null,
      village: data.village,
      canton: data.canton,
      prefecture: data.prefecture,
      region: data.region,
      status: data.member_status,
      member_since: data.member_since,
    },
    cooperative: {
      name: data.cooperative_name,
      faitiere_name: data.faitiere_name,
    },
  })
}
