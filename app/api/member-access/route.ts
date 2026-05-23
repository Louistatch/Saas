import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'

const log = createLogger('api:member-access')

/**
 * POST /api/member-access
 * Login by card number — returns member info + cooperative if valid.
 * No password needed. Card number = access token for members.
 */
export async function POST(request: NextRequest) {
  // Rate limiting: prevent card number brute-force (10 attempts per minute per IP)
  const clientKey = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`member-access:${clientKey}`, 10, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans une minute.' },
      { status: 429 },
    )
  }
  let body: { card_number?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const cardNumber = body.card_number?.trim()
  if (!cardNumber || cardNumber.length < 5) {
    return NextResponse.json({ error: 'Numéro de carte invalide' }, { status: 400 })
  }

  try {
    const supabase = await createClient()

    // Find active card
    const { data: card, error: cardError } = await supabase
      .from('member_cards')
      .select(`
        id, card_number, status, expiry_date, cooperative_id,
        member:members(id, first_name, last_name, phone, photo_url, village, canton, prefecture, region)
      `)
      .eq('card_number', cardNumber)
      .eq('status', 'active')
      .single()

    if (cardError || !card) {
      return NextResponse.json(
        { error: 'Carte non trouvée ou expirée. Vérifiez votre numéro.' },
        { status: 404 },
      )
    }

    // Check expiry
    if (card.expiry_date && new Date(card.expiry_date) < new Date()) {
      return NextResponse.json(
        { error: 'Votre carte a expiré. Contactez votre coopérative.' },
        { status: 403 },
      )
    }

    // Get cooperative name
    const { data: coop } = await supabase
      .from('cooperatives')
      .select('id, name, faitiere_name')
      .eq('id', card.cooperative_id)
      .single()

    // Log access
    await supabase.from('member_access_logs').insert({
      card_number: cardNumber,
      member_id: (card.member as any)?.id,
      cooperative_id: card.cooperative_id,
      action: 'login',
    })

    return NextResponse.json({
      success: true,
      member: card.member,
      card: {
        number: card.card_number,
        expiry: card.expiry_date,
      },
      cooperative: coop,
      access: 'full', // Members get full free access
    })
  } catch (error) {
    log.error('Member access error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
