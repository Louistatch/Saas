/**
 * Annonces du producteur (emploi, prévente, autre besoin Haroo), publiées
 * depuis « Exploitation » dans le parcours de vérification de carte.
 *
 * GET  /api/verify/[card_number]/announcements — mes annonces + valeurs par
 *      défaut du formulaire (téléphone et zone de la fiche membre)
 * POST /api/verify/[card_number]/announcements — publier une annonce
 *
 * Une annonce publiée est PUBLIQUE : la policy `announcements_public` la rend
 * lisible, contact_phone compris, par n'importe quel visiteur, y compris
 * anonyme — c'est ce qui permet à un ouvrier ou un acheteur de la trouver sur
 * la page Marché. L'écran doit le dire (il disait « visible par les membres de
 * votre coopérative », ce qui était faux).
 */

import { ANNOUNCEMENT_TYPES, type AnnouncementType } from '@/lib/announcements/models'
import { describeZone, resolveZone } from '@/lib/market/zone'
import { requirePrivateCard } from '@/lib/security/card-access'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { type NextRequest, NextResponse } from 'next/server'

const ANNOUNCEMENT_COLUMNS =
  'id, type, title, description, culture, quantity_kg, price_per_kg_fcfa, location_canton, contact_phone, status, created_at'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface MemberRow {
  phone: string | null
  canton_id: string | null
  prefecture_id: string | null
  region_id: string | null
  // Noms en texte libre : 6 fiches sur 16 n'ont que ça (« Dankpen », « lama_kara »).
  canton: string | null
  prefecture: string | null
  region: string | null
}

/** Identifiants d'abord, noms en repli : resolveZone arbitre. */
function memberZoneInput(member: MemberRow | null) {
  return {
    cantonId: member?.canton_id,
    prefectureId: member?.prefecture_id,
    regionId: member?.region_id,
    cantonName: member?.canton,
    prefectureName: member?.prefecture,
    regionName: member?.region,
  }
}

type CardAccess = Extract<Awaited<ReturnType<typeof requirePrivateCard>>, { ok: true }>

/**
 * La fiche membre porte déjà téléphone, canton, préfecture et région. La
 * lire évite de faire retaper au producteur ce que la base sait, et surtout
 * de lui faire deviner un canton que la liste (38 sur ~400 au Togo) ne
 * contient peut-être même pas.
 *
 * Une fiche illisible (RLS) ou absente donne simplement des valeurs vides : le
 * formulaire retombe alors sur la saisie manuelle au lieu d'échouer.
 */
async function loadMember(supabase: CardAccess['supabase'], memberId: string) {
  const { data } = await supabase
    .from('members')
    .select('phone, canton_id, prefecture_id, region_id, canton, prefecture, region')
    .eq('id', memberId)
    .maybeSingle<MemberRow>()
  return data
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ card_number: string }> },
) {
  const { card_number } = await params
  const access = await requirePrivateCard(decodeURIComponent(card_number))
  if (!access.ok) return access.response
  const { card, supabase } = access

  if (!card?.member_id) {
    return NextResponse.json({ error: 'Carte non trouvée.' }, { status: 404 })
  }

  const { data: announcements } = await supabase
    .from('producer_announcements')
    .select(ANNOUNCEMENT_COLUMNS)
    .eq('member_id', card.member_id)
    .order('created_at', { ascending: false })

  const member = await loadMember(supabase, card.member_id)
  const zone = await resolveZone(supabase, memberZoneInput(member))

  // Préfecture inconnue : on fournit de quoi en choisir une. Sinon, aucun
  // sélecteur n'est nécessaire et on n'envoie pas 37 lignes pour rien.
  let prefectures: { id: string; name: string; region: string | null }[] = []
  if (!zone.prefectureId) {
    const { data } = await supabase
      .from('prefectures')
      .select('id, name, regions(name)')
      .order('name')
      .returns<{ id: string; name: string; regions: { name: string } | null }[]>()
    prefectures = (data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      region: p.regions?.name ?? null,
    }))
  }

  return NextResponse.json(
    {
      announcements: announcements ?? [],
      defaults: {
        phone: member?.phone ?? null,
        zone: { prefecture_id: zone.prefectureId, label: describeZone(zone) },
        prefectures,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ card_number: string }> },
) {
  const rateLimited = await applyRateLimit(request, 'verify')
  if (rateLimited) return rateLimited

  const { card_number } = await params
  const access = await requirePrivateCard(decodeURIComponent(card_number))
  if (!access.ok) return access.response
  const { card, supabase, userId } = access

  if (!card?.member_id) {
    return NextResponse.json({ error: 'Carte non trouvée.' }, { status: 404 })
  }

  try {
    const body = await request.json()
    const {
      type,
      title,
      description,
      culture,
      quantity_kg,
      price_per_kg_fcfa,
      location_canton,
      prefecture_id,
      contact_phone,
    } = body

    const validTypes = ANNOUNCEMENT_TYPES.map((t) => t.id) as AnnouncementType[]
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Type d'annonce invalide" }, { status: 400 })
    }

    const trimmedTitle = typeof title === 'string' ? title.trim() : ''
    if (trimmedTitle.length < 3 || trimmedTitle.length > 120) {
      return NextResponse.json(
        { error: 'Donnez un titre de 3 à 120 caractères' },
        { status: 400 },
      )
    }

    const quantity = quantity_kg != null ? Number(quantity_kg) : null
    if (quantity != null && (!Number.isFinite(quantity) || quantity <= 0)) {
      return NextResponse.json({ error: 'Quantité invalide' }, { status: 400 })
    }

    const price = price_per_kg_fcfa != null ? Number(price_per_kg_fcfa) : null
    if (price != null && (!Number.isFinite(price) || price <= 0 || price > 1000000)) {
      return NextResponse.json({ error: 'Prix invalide' }, { status: 400 })
    }

    // La préfecture choisie à l'écran l'emporte ; à défaut, la zone de la
    // fiche membre. Dans les deux cas c'est resolveZone qui déduit la région
    // (et le canton, quand il existe) — jamais le client.
    const member = await loadMember(supabase, card.member_id)
    const chosenPrefecture =
      typeof prefecture_id === 'string' && UUID.test(prefecture_id) ? prefecture_id : null
    const zone = await resolveZone(
      supabase,
      chosenPrefecture ? { prefectureId: chosenPrefecture } : memberZoneInput(member),
    )

    const phone =
      typeof contact_phone === 'string' && contact_phone.trim()
        ? contact_phone.trim().slice(0, 30)
        : (member?.phone ?? null)

    const { data, error } = await supabase
      .from('producer_announcements')
      .insert({
        // La policy RLS `announcements_owner` exige author_id = auth.uid(). Sa
        // omission faisait échouer CHAQUE publication depuis cet écran avec
        // 42501 — vérifié en base, y compris pour un super_admin — et l'écran
        // répondait « Erreur lors de l'enregistrement » sans autre indice.
        author_id: userId,
        member_id: card.member_id,
        cooperative_id: card.cooperative_id,
        type,
        title: trimmedTitle,
        description:
          typeof description === 'string' ? description.trim().slice(0, 1000) || null : null,
        culture: typeof culture === 'string' ? culture.trim().slice(0, 80) || null : null,
        quantity_kg: quantity,
        price_per_kg_fcfa: price,
        // Les trois identifiants alimentent le tri « près de chez moi » du
        // Marché ; sans eux une annonce tombait toujours dans « ailleurs ».
        canton_id: zone.cantonId,
        prefecture_id: zone.prefectureId,
        region_id: zone.regionId,
        // Texte libre historique, gardé cohérent avec l'identifiant.
        location_canton:
          zone.cantonName ??
          (typeof location_canton === 'string' ? location_canton.trim().slice(0, 80) || null : null),
        contact_phone: phone,
        status: 'active',
      })
      .select(ANNOUNCEMENT_COLUMNS)
      .single()

    if (error) {
      // 42501 = refus RLS : l'utilisateur n'est ni propriétaire de la fiche ni
      // administrateur de son organisation. Le dire vaut mieux qu'un 500.
      if (error.code === '42501') {
        return NextResponse.json(
          { error: "Vous n'avez pas le droit de publier pour cette carte." },
          { status: 403 },
        )
      }
      return NextResponse.json({ error: "Erreur lors de l'enregistrement" }, { status: 500 })
    }

    return NextResponse.json({ announcement: data, message: 'Annonce publiée !' }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }
}
