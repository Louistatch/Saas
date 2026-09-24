/**
 * Spécimen de carte professionnelle Haroo, en PNG.
 *
 * GET /api/haroo/card/preview?type=OUVRIER
 *
 * Sert à montrer la VRAIE carte sur les pages publiques, au lieu d'un aplat
 * de couleur dessiné en HTML qui ne ressemble à rien de ce que le titulaire
 * recevra. Aucune donnée personnelle : le porteur est un spécimen, le numéro
 * ne correspond à aucune carte émise.
 *
 * Endpoint public et mis en cache — il ne dépend d'aucune session.
 */

import { CARD_FONT_FAMILY, loadCardFonts } from '@/lib/card-engine/fonts'
import { type HarooCardType, renderHarooCardSvg } from '@/lib/card-engine/haroo-card'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import { type NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const SPECIMENS: Record<HarooCardType, { cardNumber: string; organisation: string | null }> = {
  OUVRIER: { cardNumber: 'OUV-000000', organisation: null },
  ACHETEUR: { cardNumber: 'ACH-000000', organisation: null },
  AGRONOME: { cardNumber: 'AGR-000000', organisation: null },
  OPERATEUR: { cardNumber: 'OPE-000000', organisation: null },
}

let wasmReady = false
async function ensureWasm() {
  if (wasmReady) return
  try {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const buffer = await readFile(
      join(process.cwd(), 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm'),
    )
    await initWasm(buffer)
    wasmReady = true
  } catch (e: unknown) {
    // Rechargement à chaud en développement : le module est déjà initialisé.
    if (e instanceof Error && e.message.includes('Already initialized')) wasmReady = true
    else throw e
  }
}

export async function GET(request: NextRequest) {
  const limit = rateLimit(`haroo-card-preview:${clientKeyFromHeaders(request.headers)}`, 60, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })

  const typeParam = (new URL(request.url).searchParams.get('type') ?? '').toUpperCase()
  if (!(typeParam in SPECIMENS)) {
    return NextResponse.json({ error: 'Type de carte inconnu' }, { status: 400 })
  }
  const type = typeParam as HarooCardType
  const specimen = SPECIMENS[type]

  const svg = renderHarooCardSvg({
    type,
    firstName: 'Prénom',
    lastName: 'NOM',
    cardNumber: specimen.cardNumber,
    organisation: specimen.organisation,
  })

  await ensureWasm()
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1180 },
    font: {
      fontBuffers: await loadCardFonts(),
      defaultFontFamily: CARD_FONT_FAMILY,
      loadSystemFonts: false,
    },
  })
    .render()
    .asPng()

  return new NextResponse(png, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      // Rien de personnel : le spécimen peut être mis en cache longuement.
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  })
}
