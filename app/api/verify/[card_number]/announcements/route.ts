/**
 * Producer announcements (jobs, pre-sales, other Haroo-related posts)
 * created inline from "Mon Exploitation" in the card-verification flow.
 *
 * GET  /api/verify/[card_number]/announcements — list the producer's own announcements
 * POST /api/verify/[card_number]/announcements — create a new announcement
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { ANNOUNCEMENT_TYPES, type AnnouncementType } from '@/lib/announcements/models'

const ANNOUNCEMENT_COLUMNS =
  'id, type, title, description, culture, quantity_kg, price_per_kg_fcfa, location_canton, contact_phone, status, created_at'

async function resolveCard(cardNumber: string) {
  const supabase = await createClient()
  const { data: card } = await supabase
    .from('member_cards')
    .select('member_id, cooperative_id')
    .eq('card_number', cardNumber.toUpperCase().trim())
    .eq('status', 'active')
    .maybeSingle()
  return card
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ card_number: string }> }
) {
  const { card_number } = await params
  const card = await resolveCard(decodeURIComponent(card_number))

  if (!card?.member_id) {
    return NextResponse.json({ error: 'Carte non trouvée.' }, { status: 404 })
  }

  const supabaseAdmin = createAdminClient()
  const { data: announcements } = await supabaseAdmin
    .from('producer_announcements')
    .select(ANNOUNCEMENT_COLUMNS)
    .eq('member_id', card.member_id)
    .order('created_at', { ascending: false })

  return NextResponse.json(
    { announcements: announcements ?? [] },
    { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' } }
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ card_number: string }> }
) {
  const rateLimited = await applyRateLimit(request, 'verify')
  if (rateLimited) return rateLimited

  const { card_number } = await params
  const card = await resolveCard(decodeURIComponent(card_number))

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
      contact_phone,
    } = body

    const validTypes = ANNOUNCEMENT_TYPES.map((t) => t.id) as AnnouncementType[]
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Type d\'annonce invalide' }, { status: 400 })
    }

    const trimmedTitle = typeof title === 'string' ? title.trim() : ''
    if (!trimmedTitle || trimmedTitle.length > 120) {
      return NextResponse.json({ error: 'Titre requis (120 caractères max)' }, { status: 400 })
    }

    const quantity = quantity_kg != null ? Number(quantity_kg) : null
    if (quantity != null && (!Number.isFinite(quantity) || quantity <= 0)) {
      return NextResponse.json({ error: 'Quantité invalide' }, { status: 400 })
    }

    const price = price_per_kg_fcfa != null ? Number(price_per_kg_fcfa) : null
    if (price != null && (!Number.isFinite(price) || price <= 0 || price > 1000000)) {
      return NextResponse.json({ error: 'Prix invalide' }, { status: 400 })
    }

    const supabaseAdmin = createAdminClient()
    const { data, error } = await supabaseAdmin
      .from('producer_announcements')
      .insert({
        member_id: card.member_id,
        cooperative_id: card.cooperative_id,
        type,
        title: trimmedTitle,
        description: typeof description === 'string' ? description.trim().slice(0, 1000) || null : null,
        culture: typeof culture === 'string' ? culture.trim().slice(0, 80) || null : null,
        quantity_kg: quantity,
        price_per_kg_fcfa: price,
        location_canton: typeof location_canton === 'string' ? location_canton.trim().slice(0, 80) || null : null,
        contact_phone: typeof contact_phone === 'string' ? contact_phone.trim().slice(0, 30) || null : null,
        status: 'active',
      })
      .select(ANNOUNCEMENT_COLUMNS)
      .single()

    if (error) {
      return NextResponse.json({ error: 'Erreur lors de l\'enregistrement' }, { status: 500 })
    }

    return NextResponse.json({ announcement: data, message: 'Annonce publiée !' }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }
}
