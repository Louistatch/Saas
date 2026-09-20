import 'server-only'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { NextResponse } from 'next/server'

export function normalizedCardNumber(value: string): string | null {
  const card = value.trim().toUpperCase()
  return /^[A-Z0-9]{2,5}-\d{4,6}$/.test(card) ? card : null
}

/** Public lookup: only a single validated card, never arbitrary filters or member details. */
export async function resolvePublicCard(value: string) {
  const number = normalizedCardNumber(value)
  if (!number) return null
  const { data, error } = await createAdminClient()
    .from('member_cards')
    .select('member_id, cooperative_id, expiry_date')
    .eq('card_number', number)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error('Card lookup unavailable')
  if (!data || (data.expiry_date && data.expiry_date < new Date().toISOString().slice(0, 10)))
    return null
  return data
}

/** Private card services require a session; the scoped card RLS remains the authority. */
export async function requirePrivateCard(value: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Connectez-vous pour accéder aux informations privées de cette carte.' },
        { status: 401 },
      ),
    }
  const number = normalizedCardNumber(value)
  if (!number)
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Carte invalide' }, { status: 404 }),
    }
  const { data: card, error } = await supabase
    .from('member_cards')
    .select('member_id, cooperative_id, expiry_date')
    .eq('card_number', number)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle()
  if (error)
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Service indisponible' }, { status: 503 }),
    }
  if (!card || (card.expiry_date && card.expiry_date < new Date().toISOString().slice(0, 10))) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Carte inaccessible' }, { status: 404 }),
    }
  }
  return { ok: true as const, card, supabase, userId: user.id }
}

export function cardRateLimit(request: Request) {
  const result = rateLimit(`verify:${clientKeyFromHeaders(request.headers)}`, 10, 60_000)
  return result.ok ? null : NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
}
