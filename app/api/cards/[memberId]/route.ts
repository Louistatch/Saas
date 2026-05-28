/**
 * Server-side card PNG generation route.
 * 
 * GET /api/cards/:memberId
 * 
 * Generates a high-resolution PNG of the member identity card
 * using SVG rendering + @resvg/resvg-js (no Chromium needed).
 * 
 * Auth: requires authenticated user with access to the member's cooperative.
 * Output: image/png (2360px wide, ~80ms generation time)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { Resvg } from '@resvg/resvg-js'
import { createClient } from '@/lib/supabase/server'
import { buildCardSchema, renderToSvgString } from '@/lib/card-engine'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { memberId } = await params

  if (!memberId || memberId.length < 10) {
    return NextResponse.json({ error: 'Invalid member ID' }, { status: 400 })
  }

  const supabase = await createClient()

  // Verify the user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser()
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
    return NextResponse.json(
      { error: 'Carte active introuvable pour ce membre' },
      { status: 404 }
    )
  }

  // Fetch member details
  const { data: member } = await supabase
    .from('members')
    .select('first_name, last_name, phone, photo_url, village, canton, prefecture, region')
    .eq('id', memberId)
    .maybeSingle()

  if (!member) {
    return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 })
  }

  // Fetch cooperative + faîtière info
  const { data: coop } = await supabase
    .from('cooperatives')
    .select('name, faitiere_name, level')
    .eq('id', card.cooperative_id)
    .maybeSingle()

  // Build the card schema
  const schema = buildCardSchema({
    member: {
      first_name: member.first_name,
      last_name: member.last_name,
      phone: member.phone,
      photo_url: member.photo_url,
      village: member.village,
      canton: member.canton,
      prefecture: member.prefecture,
      region: member.region,
    },
    cardNumber: card.card_number,
    expiryDate: card.expiry_date,
    createdAt: card.created_at,
    cooperativeName: coop?.name ?? '',
    faitiereName: coop?.faitiere_name ?? 'FaîtiereHub',
    level: (coop?.level === 'or' || coop?.level === 'argent' || coop?.level === 'bronze')
      ? coop.level
      : 'bronze',
  })

  // Render SVG
  const svg = renderToSvgString(schema)

  // Rasterize to PNG at 2x resolution (2360×1480)
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 2360 },
    font: {
      loadSystemFonts: false,
      defaultFontFamily: 'sans-serif',
    },
  })
  const pngData = resvg.render()
  const pngBuffer = pngData.asPng()

  // Return PNG with cache headers (card is valid for a while)
  return new NextResponse(pngBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="carte-${card.card_number}.png"`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
