// [SECURITY FIX - FORGE-001 - Sous-étape B]
// Route API serveur pour la vérification de carte — utilise la vue restrictive uniquement.
// Empêche l'énumération en validant le format et en appliquant un délai constant.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { rateLimit, clientKeyFromHeaders } from '@/lib/utils/rate-limit'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { queueInAppNotification } from '@/lib/notifications/queue'

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

  // Use server client — the anon RLS policy allows SELECT on active member_cards
  // with embedded joins to members and cooperatives.
  const supabase = await createClient()

  // Construire la liste des variantes possibles (O↔0, I↔1) du préfixe.
  const [prefix, suffix] = parsed.data.split('-')
  const variants = expandAmbiguousVariants(prefix).map((p) => `${p}-${suffix}`)

  // First: get the card (anon can read active cards) — include id and card_type for branching
  const { data: card, error: cardError } = await supabase
    .from('member_cards')
    .select('id, card_number, status, expiry_date, created_at, member_id, cooperative_id, card_type')
    .in('card_number', variants)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (cardError || !card) {
    // Fallback: try Haroo platform (OUVRIER / ACHETEUR / AGRONOME cards)
    const harooResult = await tryHarooVerify(decodedCardNumber)
    if (harooResult) return NextResponse.json(harooResult)

    await new Promise(r => setTimeout(r, 100)) // Timing-safe
    return NextResponse.json({ valid: false, error: 'Carte non trouvée' }, { status: 404 })
  }

  // Vérifier l'expiration
  const isExpired = card.expiry_date && new Date(card.expiry_date) < new Date()
  const isActive = card.status === 'active' && !isExpired

  const cardOut = {
    card_number: card.card_number,
    status: isActive ? 'active' : (isExpired ? 'expired' : card.status),
    expiry_date: card.expiry_date,
    created_at: card.created_at,
  }

  const cardType: string = card.card_type ?? 'FAITIERE'

  // ── OUVRIER ──────────────────────────────────────────────────────────────
  if (cardType === 'OUVRIER') {
    interface OuvrierProfileRow {
      first_name: string
      last_name: string
      phone: string | null
      photo_url: string | null
      competences: string[]
      cantons_disponibles: string[]
      disponible: boolean
      disponible_jusqu_au: string | null
      tarif_journalier: number | null
      note_moyenne: number
      nombre_avis: number
    }
    const { data: ouvrierData } = await supabase
      .from('ouvrier_profiles')
      .select('first_name, last_name, phone, photo_url, competences, cantons_disponibles, disponible, disponible_jusqu_au, tarif_journalier, note_moyenne, nombre_avis')
      .eq('card_id', card.id)
      .maybeSingle<OuvrierProfileRow>()

    interface OffreRow {
      id: string
      titre: string
      culture: string | null
      description: string | null
      canton: string
      date_debut: string | null
      date_fin: string | null
      tarif_journalier: number | null
      nombre_ouvriers: number
    }
    let offres: OffreRow[] = []
    if (ouvrierData && ouvrierData.cantons_disponibles.length > 0) {
      const { data: offresData } = await supabase
        .from('offres_emploi')
        .select('id, titre, culture, description, canton, date_debut, date_fin, tarif_journalier, nombre_ouvriers')
        .in('canton', ouvrierData.cantons_disponibles)
        .eq('statut', 'OUVERTE')
        .limit(5)
      if (offresData) offres = offresData as OffreRow[]
    }

    return NextResponse.json({
      valid: isActive,
      card_type: 'OUVRIER',
      card: cardOut,
      ouvrier: ouvrierData
        ? {
            first_name: ouvrierData.first_name,
            last_name: ouvrierData.last_name,
            phone: ouvrierData.phone,
            photo_url: ouvrierData.photo_url,
            competences: ouvrierData.competences ?? [],
            cantons_disponibles: ouvrierData.cantons_disponibles ?? [],
            disponible: ouvrierData.disponible,
            disponible_jusqu_au: ouvrierData.disponible_jusqu_au,
            tarif_journalier: ouvrierData.tarif_journalier,
            note_moyenne: ouvrierData.note_moyenne ?? 0,
            nombre_avis: ouvrierData.nombre_avis ?? 0,
          }
        : null,
      offres,
    })
  }

  // ── ACHETEUR ─────────────────────────────────────────────────────────────
  if (cardType === 'ACHETEUR') {
    interface AcheteurProfileRow {
      first_name: string
      last_name: string
      phone: string | null
      photo_url: string | null
      type_acheteur: string
      nom_organisation: string | null
      produits_interesses: string[]
      cantons_intervention: string[]
      prefectures_intervention: string[]
    }
    const { data: acheteurData } = await supabase
      .from('acheteur_profiles')
      .select('first_name, last_name, phone, photo_url, type_acheteur, nom_organisation, produits_interesses, cantons_intervention, prefectures_intervention')
      .eq('card_id', card.id)
      .maybeSingle<AcheteurProfileRow>()

    interface PreventeRow {
      id: string
      culture: string
      quantite_estimee: number
      prix_par_kg: number
      date_recolte_prevue: string
      canton: string
      description: string | null
    }
    let preventes: PreventeRow[] = []
    const preventeQuery = supabase
      .from('preventes')
      .select('id, culture, quantite_estimee, prix_par_kg, date_recolte_prevue, canton, description')
      .eq('statut', 'DISPONIBLE')
      .limit(5)

    if (acheteurData && acheteurData.prefectures_intervention.length > 0) {
      const { data: preventeData } = await preventeQuery.in('prefecture', acheteurData.prefectures_intervention)
      if (preventeData) preventes = preventeData as PreventeRow[]
    } else {
      const { data: preventeData } = await preventeQuery
      if (preventeData) preventes = preventeData as PreventeRow[]
    }

    return NextResponse.json({
      valid: isActive,
      card_type: 'ACHETEUR',
      card: cardOut,
      acheteur: acheteurData
        ? {
            first_name: acheteurData.first_name,
            last_name: acheteurData.last_name,
            phone: acheteurData.phone,
            photo_url: acheteurData.photo_url,
            type_acheteur: acheteurData.type_acheteur,
            nom_organisation: acheteurData.nom_organisation,
            produits_interesses: acheteurData.produits_interesses ?? [],
            cantons_intervention: acheteurData.cantons_intervention ?? [],
          }
        : null,
      preventes,
    })
  }

  // ── AGRONOME ─────────────────────────────────────────────────────────────
  if (cardType === 'AGRONOME') {
    interface AgronomeProfileRow {
      first_name: string
      last_name: string
      phone: string | null
      photo_url: string | null
      specialisations: string[]
      canton: string | null
      prefecture: string | null
      region: string | null
      badge_valide: boolean
      statut_validation: string
      disponible_missions: boolean
      note_moyenne: number
      nombre_missions: number
    }
    const { data: agronomeData } = await supabase
      .from('agronome_profiles')
      .select('first_name, last_name, phone, photo_url, specialisations, canton, prefecture, region, badge_valide, statut_validation, disponible_missions, note_moyenne, nombre_missions')
      .eq('card_id', card.id)
      .maybeSingle<AgronomeProfileRow>()

    interface MissionRow {
      id: string
      titre: string
      culture: string | null
      description: string | null
      canton: string
      budget: number | null
      date_souhaitee: string | null
    }
    let missions: MissionRow[] = []
    if (agronomeData?.canton) {
      const { data: missionsData } = await supabase
        .from('missions')
        .select('id, titre, culture, description, canton, budget, date_souhaitee')
        .eq('canton', agronomeData.canton)
        .eq('statut', 'OUVERTE')
        .limit(5)
      if (missionsData) missions = missionsData as MissionRow[]
    }

    return NextResponse.json({
      valid: isActive,
      card_type: 'AGRONOME',
      card: cardOut,
      agronome: agronomeData
        ? {
            first_name: agronomeData.first_name,
            last_name: agronomeData.last_name,
            phone: agronomeData.phone,
            photo_url: agronomeData.photo_url,
            specialisations: agronomeData.specialisations ?? [],
            canton: agronomeData.canton,
            prefecture: agronomeData.prefecture,
            region: agronomeData.region,
            badge_valide: agronomeData.badge_valide,
            statut_validation: agronomeData.statut_validation,
            disponible_missions: agronomeData.disponible_missions,
            note_moyenne: agronomeData.note_moyenne ?? 0,
            nombre_missions: agronomeData.nombre_missions ?? 0,
          }
        : null,
      missions,
    })
  }

  // ── FAITIERE (default) ────────────────────────────────────────────────────
  // Second: get member info (may fail if anon doesn't have access — graceful fallback)
  interface MemberRow {
    first_name: string | null
    last_name: string | null
    photo_url: string | null
    village: string | null
    canton: string | null
    prefecture: string | null
    region: string | null
    status: string | null
    created_at: string | null
  }
  interface CoopRow {
    name: string | null
    faitiere_name: string | null
  }
  let member: MemberRow | null = null
  let coop: CoopRow | null = null

  if (card.member_id) {
    const { data: memberData } = await supabase
      .from('members')
      .select('first_name, last_name, photo_url, village, canton, prefecture, region, status, created_at')
      .eq('id', card.member_id)
      .maybeSingle<MemberRow>()
    if (memberData) member = memberData
  }

  if (card.cooperative_id) {
    const { data: coopData } = await supabase
      .from('cooperatives')
      .select('name, faitiere_name')
      .eq('id', card.cooperative_id)
      .maybeSingle<CoopRow>()
    if (coopData) coop = coopData
  }

  // Log the scan (fire-and-forget — never block the response)
  void Promise.resolve(supabase.from('member_access_logs').insert({
    card_number: card.card_number,
    member_id: card.member_id ?? null,
    cooperative_id: card.cooperative_id ?? null,
    action: 'scan',
  }))

  // In-app notification for cooperative admin (fire-and-forget)
  if (card.cooperative_id) {
    void queueInAppNotification({
      cooperativeId: card.cooperative_id,
      title: 'Carte scannée',
      body: `Carte ${card.card_number} scannée à ${new Date().toLocaleTimeString('fr-FR')}`,
      type: 'info',
      icon: 'scan-line',
      link: '/dashboard/analytics',
    })
  }

  return NextResponse.json({
    valid: isActive,
    card_type: 'FAITIERE',
    source: 'faitierehub' as const,
    member_id: card.member_id ?? null,
    card: cardOut,
    member: {
      first_name: member?.first_name ?? null,
      last_name: member?.last_name ?? null,
      photo_url: member?.photo_url ?? null,
      village: member?.village ?? null,
      canton: member?.canton ?? null,
      prefecture: member?.prefecture ?? null,
      region: member?.region ?? null,
      status: member?.status ?? null,
      member_since: member?.created_at ?? null,
    },
    cooperative: {
      name: coop?.name ?? null,
      faitiere_name: coop?.faitiere_name ?? null,
    },
  })
}

// ── Haroo fallback ────────────────────────────────────────────────────────────

// Passe par AgriTogo (AGRITOGO_API_URL déjà configuré) — pas d'URL Haroo directe.
// AgriTogo expose GET /api/v1/haroo/verify/<card_number> qui proxy vers Haroo.
async function tryHarooVerify(cardNumber: string): Promise<Record<string, unknown> | null> {
  const agritogoUrl = process.env.AGRITOGO_API_URL?.replace(/\/$/, '')
  if (!agritogoUrl) return null

  try {
    const res = await fetch(
      `${agritogoUrl}/api/v1/haroo/verify/${encodeURIComponent(cardNumber)}`,
      { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' } }
    )
    if (!res.ok) return null
    return await res.json()  // source:'haroo' already injected by AgriTogo
  } catch {
    return null
  }
}
