/**
 * Draws a billboard face on a 2D canvas (browser only): the creative's colours, title, short
 * text, the advertiser, and « Promotion » when sponsored. An optional poster image (allowed
 * host, already validated) is drawn underneath when it loads; any failure keeps the drawn face.
 */
import { type AdCampaign, isSponsored, safeImage } from './campaigns'

export const POSTER_W = 512
export const POSTER_H = 288

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, lines: number): string[] {
  const words = text.split(/\s+/)
  const out: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (ctx.measureText(next).width > max && cur) {
      out.push(cur)
      cur = w
      if (out.length === lines) break
    } else cur = next
  }
  if (out.length < lines && cur) out.push(cur)
  if (out.length === lines && words.join(' ') !== out.join(' '))
    out[lines - 1] = `${out[lines - 1].replace(/\s+\S*$/, '')}…`
  return out
}

export function drawPoster(
  canvas: HTMLCanvasElement,
  c: AdCampaign,
  image?: HTMLImageElement | null,
) {
  canvas.width = POSTER_W
  canvas.height = POSTER_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const [bg, fg, accent] = c.creative.palette
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, POSTER_W, POSTER_H)
  if (image) {
    const r = Math.max(POSTER_W / image.width, POSTER_H / image.height)
    const w = image.width * r
    const h = image.height * r
    ctx.drawImage(image, (POSTER_W - w) / 2, (POSTER_H - h) / 2, w, h)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, POSTER_H - 128, POSTER_W, 128)
  }
  // Accent band on the left edge, like a printed street poster.
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, 18, POSTER_H)
  ctx.fillStyle = fg
  ctx.font = '800 46px system-ui, sans-serif'
  ctx.textBaseline = 'top'
  const titleY = image ? POSTER_H - 118 : 46
  for (const [i, line] of wrap(ctx, c.creative.title, POSTER_W - 70, 2).entries())
    ctx.fillText(line, 42, titleY + i * 52)
  if (!image) {
    ctx.font = '500 26px system-ui, sans-serif'
    ctx.globalAlpha = 0.92
    for (const [i, line] of wrap(ctx, c.creative.body, POSTER_W - 70, 3).entries())
      ctx.fillText(line, 42, 160 + i * 32)
    ctx.globalAlpha = 1
  }
  ctx.font = '700 18px system-ui, sans-serif'
  ctx.fillStyle = accent
  ctx.fillText(c.advertiser.name.toUpperCase(), 42, 14)
  if (isSponsored(c)) {
    const label = 'Promotion'
    ctx.font = '700 18px system-ui, sans-serif'
    const w = ctx.measureText(label).width + 20
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillRect(POSTER_W - w - 14, 10, w, 28)
    ctx.fillStyle = '#111827'
    ctx.fillText(label, POSTER_W - w - 4, 15)
  }
}

/** Loads the creative's image if any (CORS, timeout); resolves null on any problem. */
export function loadPosterImage(c: AdCampaign, timeoutMs = 6000): Promise<HTMLImageElement | null> {
  const src = safeImage(c.creative.image)
  if (!src) return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    const t = window.setTimeout(() => resolve(null), timeoutMs)
    img.onload = () => {
      window.clearTimeout(t)
      resolve(img.width > 0 && img.width <= 2048 && img.height <= 2048 ? img : null)
    }
    img.onerror = () => {
      window.clearTimeout(t)
      resolve(null)
    }
    img.src = src
  })
}
