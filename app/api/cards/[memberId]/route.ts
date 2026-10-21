/**
 * Server-side card PNG generation route.
 *
 * GET /api/cards/:memberId
 *
 * Generates a high-resolution PNG of the member identity card
 * using SVG rendering + @resvg/resvg-wasm (Vercel/Turbopack compatible).
 *
 * Auth: requires authenticated user with access to the member's cooperative.
 * Output: image/png (2360px wide, ~80ms generation time)
 */

import { renderMemberCardPng } from '@/lib/cards/render-member-card'
import { assertTenantAccess } from '@/lib/security/assert-access'
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const { memberId } = await params

  if (!memberId || memberId.length < 10) {
    return NextResponse.json({ error: 'Invalid member ID' }, { status: 400 })
  }

  const supabase = await createClient()

  // Verify the user is authenticated
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  // Fetch the active card for this member
  const { data: card, error: cardError } = await supabase
    .from('member_cards')
    .select('card_number, status, expiry_date, created_at, cooperative_id, member_id')
    .eq('member_id', memberId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cardError || !card) {
    return NextResponse.json({ error: 'Carte active introuvable pour ce membre' }, { status: 404 })
  }

  // SEC-05: verify the caller actually has access to this card's cooperative.
  // Authentication alone is insufficient — any admin could otherwise render the
  // PNG of a member in a cooperative they don't belong to.
  const tenant = await assertTenantAccess(card.cooperative_id)
  if (!tenant.ok) return tenant.response

  const pngBuffer = await renderMemberCardPng(supabase, card)
  if (!pngBuffer) {
    return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 })
  }

  // Return PNG with cache headers
  return new NextResponse(pngBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="carte-${card.card_number}.png"`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
