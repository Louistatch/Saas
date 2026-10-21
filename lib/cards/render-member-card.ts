import 'server-only'
/**
 * Rendu PNG d'une carte membre (moteur existant lib/card-engine, rastérisé par resvg-wasm).
 * Partagé par /api/cards/[memberId] (organisation) et /api/payg/cards/[cardId]/print
 * (opérateur, self-print) : un seul moteur de cartes et de QR codes.
 */
import { buildCardSchema, renderToSvgString } from '@/lib/card-engine'
import { CARD_FONT_FAMILY, loadCardFonts } from '@/lib/card-engine/fonts'
import type { Database } from '@/types/supabase'
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface RenderableCard {
  card_number: string
  expiry_date: string | null
  created_at: string | null
  cooperative_id: string | null
  member_id: string | null
}

/**
 * Server-side image inliner. The renderer's own imageToDataUrl() relies on
 * FileReader, a browser API, so it cannot be reused here — resvg has no network
 * stack and would silently drop an <image href="https://…">, printing a card
 * with a blank emblem plate. A logo that cannot be fetched degrades to no logo,
 * never to a failed card.
 */
async function fetchAsDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null
  if (url.startsWith('data:')) return url
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    if (!response.ok) return null
    const type = response.headers.get('content-type') ?? 'image/png'
    if (!type.startsWith('image/')) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    // Keep the payload sane: a multi-MB logo would bloat every card render.
    if (buffer.byteLength > 512 * 1024) return null
    return `data:${type};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

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

/**
 * Rend la carte en PNG (2360 px de large). `supabase` lit le membre et sa coopérative : le
 * client de l'utilisateur côté organisation, le client service_role côté opérateur une fois
 * ses droits vérifiés. `null` si le membre est introuvable.
 */
export async function renderMemberCardPng(
  supabase: SupabaseClient<Database>,
  card: RenderableCard,
): Promise<Uint8Array | null> {
  const memberId = card.member_id ?? ''
  // Fetch member details
  const { data: member } = await supabase
    .from('members')
    .select('first_name, last_name, phone, photo_url, village, canton, prefecture, region')
    .eq('id', memberId)
    .maybeSingle()

  if (!member) return null

  // Fetch cooperative + faîtière info
  const { data: coop } = await supabase
    .from('cooperatives')
    .select('name, faitiere_name, level, logo_url, parent_id')
    .eq('id', card.cooperative_id ?? '')
    .maybeSingle()

  // Walk up the hierarchy for the issuing faîtière's own logo. The chain is
  // cooperative → union → faîtière, so the loop is bounded at a small depth
  // rather than trusted to terminate: a parent_id cycle would otherwise hang
  // the request.
  let faitiereLogo: string | null = null
  let parentId = coop?.parent_id ?? null
  for (let depth = 0; depth < 5 && parentId && !faitiereLogo; depth++) {
    const { data: parent } = await supabase
      .from('cooperatives')
      .select('level, logo_url, parent_id')
      .eq('id', parentId)
      .maybeSingle()
    if (!parent) break
    if (parent.level === 'faitiere') {
      faitiereLogo = parent.logo_url ?? null
      break
    }
    parentId = parent.parent_id ?? null
  }

  const [faitiereLogoData, coopLogoData] = await Promise.all([
    fetchAsDataUrl(faitiereLogo),
    fetchAsDataUrl(coop?.logo_url ?? null),
  ])

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
    createdAt: card.created_at ?? new Date().toISOString(),
    cooperativeName: coop?.name ?? '',
    faitiereName: coop?.faitiere_name ?? 'FaîtiereHub',
    faitiereLogoUrl: faitiereLogoData,
    cooperativeLogoUrl: coopLogoData,
    level:
      coop?.level === 'or' || coop?.level === 'argent' || coop?.level === 'bronze'
        ? coop.level
        : 'bronze',
  })

  // Render SVG
  const svg = renderToSvgString(schema)

  // Initialize WASM and rasterize to PNG at 2x resolution (2360×1480)
  await ensureWasm()
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 2360 },
    // Sans buffer de police, resvg-wasm rend les <text> vides : la carte
    // sortait avec le décor et le QR, mais sans un seul caractère.
    font: {
      fontBuffers: await loadCardFonts(),
      defaultFontFamily: CARD_FONT_FAMILY,
      loadSystemFonts: false,
    },
  })
  const pngData = resvg.render()
  const pngBuffer = pngData.asPng()

  return pngBuffer
}
