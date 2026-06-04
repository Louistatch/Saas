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

import { NextResponse, type NextRequest } from 'next/server'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { createClient } from '@/lib/supabase/server'
import { assertTenantAccess } from '@/lib/security/assert-access'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { buildCardSchema, renderToSvgString } from '@/lib/card-engine'

export const runtime = 'nodejs'

// Initialize WASM once (singleton pattern for serverless)
let wasmInitialized = false
async function ensureWasm() {
  if (wasmInitialized) return
  try {
    // Fetch the WASM binary from node_modules at build/runtime
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const wasmPath = join(process.cwd(), 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm')
    const wasmBuffer = await readFile(wasmPath)
    await initWasm(wasmBuffer)
    wasmInitialized = true
  } catch (e: unknown) {
    // Already initialized (hot reload in dev)
    if (e instanceof Error && e.message.includes('Already initialized')) {
      wasmInitialized = true
    } else {
      throw e
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  // Rate limit: PNG generation is CPU/WASM heavy (~80ms). Without this an
  // authenticated user could saturate the runtime by hammering this endpoint.
  const rateLimited = await applyRateLimit(request, 'embed')
  if (rateLimited) return rateLimited

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

  // SEC-05: verify the caller actually has access to this card's cooperative.
  // Authentication alone is insufficient — any admin could otherwise render the
  // PNG of a member in a cooperative they don't belong to.
  const tenant = await assertTenantAccess(card.cooperative_id)
  if (!tenant.ok) return tenant.response

  // Fetch member details
  const { data: member } = await supabase
    .from('members')
    .select('first_name, last_name, phone, photo_url, signature_url, village, canton, prefecture, region')
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
      signature_url: member.signature_url,
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

  // Initialize WASM and rasterize to PNG at 2x resolution (2360×1480)
  await ensureWasm()
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 2360 },
  })
  const pngData = resvg.render()
  const pngBuffer = pngData.asPng()

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
