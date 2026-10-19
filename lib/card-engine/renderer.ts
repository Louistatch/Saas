/**
 * Export de la carte de membre : SVG → canvas → PNG (navigateur).
 *
 * La carte n'a qu'une face. Le dessin est dans member-card.ts ; ce module ne
 * fait que le rasteriser. Côté serveur, resvg rasterise le même SVG (voir
 * app/api/cards/[memberId]/route.ts), avec les mêmes polices.
 *
 * Un SVG rasterisé via <img> ne charge aucune ressource externe : Poppins y
 * est donc intégrée en data URL (`loadCardFontCss`), comme les images. Les
 * mesures se font sur les chasses de ces mêmes polices (voir text-metrics.ts).
 */

import { inlineCardImages, loadCardFontCss, loadPlatformLogo } from './assets'
import { BASE_PX, BLEED, TRIM_H, TRIM_W, renderCardSvg } from './member-card'
import type { CardSchema } from './schema'

export { renderCardSvg } from './member-card'
export type { CardRenderOptions } from './member-card'

/** Pixels par unité de carte (0,1 mm) à l'échelle 1, soit ~300 ppp. */
const PX_PER_UNIT = BASE_PX / TRIM_W

/** Taille raster de la carte. `scale` 1 ≈ 300 ppp, 2 ≈ 600 ppp. */
export function cardRasterSize(opts: { bleed?: boolean; scale?: number } = {}): {
  width: number
  height: number
} {
  const { bleed = false, scale = 1 } = opts
  const w = TRIM_W + (bleed ? BLEED * 2 : 0)
  const h = TRIM_H + (bleed ? BLEED * 2 : 0)
  return {
    width: Math.round(w * PX_PER_UNIT * scale),
    height: Math.round(h * PX_PER_UNIT * scale),
  }
}

/**
 * Aperçu inline : le SVG de la carte (zone rognée, angles arrondis). Pas de
 * width/height : il s'adapte à son conteneur.
 */
export function renderToSvgString(
  schema: CardSchema,
  photoDataUrl?: string | null,
  opts: { asOf?: string; platformLogo?: string | null } = {},
): string {
  return renderCardSvg(schema, {
    mode: 'screen',
    photoDataUrl,
    asOf: opts.asOf,
    platformLogo: opts.platformLogo,
  })
}

async function svgToCanvas(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Contexte 2D indisponible — impossible de rendre la carte')

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    await new Promise<void>((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        // decode() attend aussi les polices intégrées au SVG avant le dessin.
        const ready = typeof img.decode === 'function' ? img.decode().catch(() => undefined) : null
        Promise.resolve(ready).then(() => {
          ctx.drawImage(img, 0, 0, width, height)
          resolve()
        })
      }
      img.onerror = () => reject(new Error('Échec du rendu de la carte en image'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
  return canvas
}

export interface RasterOptions {
  mode?: 'screen' | 'print'
  bleed?: boolean
  scale?: number
  asOf?: string
}

/** Rasterise la carte. Les images externes (photo, signature, logos) sont intégrées au préalable. */
export async function renderCardCanvas(
  schema: CardSchema,
  opts: RasterOptions = {},
): Promise<HTMLCanvasElement> {
  const [inlined, platformLogo, fontCss] = await Promise.all([
    inlineCardImages(schema),
    loadPlatformLogo(),
    loadCardFontCss(),
  ])
  const mode = opts.mode ?? 'screen'
  const bleed = opts.bleed ?? mode === 'print'
  const svg = renderCardSvg(inlined.schema, {
    mode,
    bleed,
    asOf: opts.asOf,
    photoDataUrl: inlined.photoDataUrl,
    platformLogo,
    intrinsicSize: true,
    fontCss,
  })
  const { width, height } = cardRasterSize({ bleed, scale: opts.scale })
  return svgToCanvas(svg, width, height)
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Échec de la création du PNG'))
    }, 'image/png')
  })
}

/** PNG numérique de la carte (face unique, angles arrondis) : l'image que l'on partage. */
export async function renderToPng(schema: CardSchema, opts: RasterOptions = {}): Promise<Blob> {
  return canvasToBlob(await renderCardCanvas(schema, { mode: 'screen', ...opts }))
}

export async function downloadCard(schema: CardSchema, filename?: string): Promise<void> {
  const blob = await renderToPng(schema)
  triggerDownload(blob, filename ?? `carte-${schema.member.cardNumber}.png`)
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function renderToDataUrl(schema: CardSchema): Promise<string> {
  const canvas = await renderCardCanvas(schema, { mode: 'screen' })
  return canvas.toDataURL('image/png')
}
