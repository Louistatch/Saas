/**
 * Card Renderer Engine — SVG-based Premium Design
 *
 * Pipeline :
 *   CardSchema → renderToSvgString() → SVG string
 *     ↓ client               ↓ server
 *   svgToCanvas()         @resvg/resvg-wasm
 *   Canvas.toBlob PNG     Node PNG buffer
 *
 * Fonts :
 *   Both paths need Barlow Condensed + Barlow embedded as base64 @font-face
 *   in the SVG <defs> so the rasterizer sees them (SVG <img> and resvg both
 *   ignore external URL fonts; embedded data: URIs work in both).
 *
 * Layout (SVG 1180×740) :
 *   Dark left area  x 0-720 : photo (circle), name, level pills, info pills
 *   White right panel x 720-1180 : branding, N°, date, statut, signature, QR
 */

import type { CardSchema } from './schema'
import { lighten, darken } from './schema'
import { encodeText } from '@/lib/utils/qr'

// ─── Font embedding ──────────────────────────────────────────────────────────
// Cache so we only pay the fetch cost once per page session.
let _fontStyleCache: string | null = null

/**
 * Fetch Barlow Condensed (700/800/900) + Barlow (600/700) from Google Fonts,
 * convert each woff2 file to base64, and return a CSS @font-face block
 * safe to embed inside an SVG <style> element.
 *
 * Falls back to '' (system fonts) if any network error occurs.
 */
export async function loadEmbeddedFontStyle(): Promise<string> {
  if (_fontStyleCache !== null) return _fontStyleCache

  try {
    // Modern UA → Google Fonts returns woff2 (supported by all major browsers
    // and by resvg ≥0.35 / fontdb ≥0.16 which ships with @resvg/resvg-wasm ≥2).
    const cssResp = await fetch(
      'https://fonts.googleapis.com/css2?' +
        'family=Barlow+Condensed:wght@700;800;900' +
        '&family=Barlow:wght@600;700' +
        '&display=swap',
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
            'AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'Chrome/124.0 Safari/537.36',
        },
        cache: 'force-cache',
      },
    )
    if (!cssResp.ok) throw new Error(`Google Fonts CSS ${cssResp.status}`)
    const css = await cssResp.text()

    // Collect unique font file URLs declared in url() references
    const urlRe = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g
    const fontUrls = [...new Set([...css.matchAll(urlRe)].map((m) => m[1]))]

    // Fetch all font files in parallel → base64
    const b64Map = new Map<string, string>()
    await Promise.all(
      fontUrls.map(async (url) => {
        try {
          const resp = await fetch(url, { cache: 'force-cache' })
          if (!resp.ok) return
          const buf = await resp.arrayBuffer()
          // Buffer.from is available in Node.js; btoa fallback for browser
          const b64 = typeof Buffer !== 'undefined'
            ? Buffer.from(buf).toString('base64')
            : btoa(String.fromCharCode(...new Uint8Array(buf)))
          b64Map.set(url, `data:font/woff2;base64,${b64}`)
        } catch { /* skip */ }
      }),
    )

    // Substitute remote URLs with data URIs
    const embedded = css.replace(
      /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g,
      (_, u) => `url(${b64Map.get(u) ?? u})`,
    )

    _fontStyleCache = embedded
    return embedded
  } catch {
    _fontStyleCache = ''
    return ''
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function trunc(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + '…'
}

function getLevelTheme(level?: string) {
  switch (level) {
    case 'or':     return { label: 'NIVEAU OR',     textColor: '#3d2c00', fill: 'url(#orGrad)',     ring: '#e0a106' }
    case 'argent': return { label: 'NIVEAU ARGENT', textColor: '#2a3540', fill: 'url(#silverGrad)', ring: '#9aa6b0' }
    default:       return { label: 'NIVEAU BRONZE', textColor: '#3a1e08', fill: 'url(#bronzeGrad)', ring: '#9c6b3f' }
  }
}

function medallionMark(x: number, y: number, ring: string): string {
  return `<g transform="translate(${x} ${y})">
    <circle cx="0" cy="0" r="9" fill="#ffffff" fill-opacity="0.9"/>
    <circle cx="0" cy="0" r="9" fill="none" stroke="${ring}" stroke-width="2"/>
    <path d="M0 -5 L1.5 -1.5 L5 -1.5 L2.2 1 L3.3 4.5 L0 2.4 L-3.3 4.5 L-2.2 1 L-5 -1.5 L-1.5 -1.5 Z" fill="${ring}"/>
  </g>`
}

function generateQrSvgPath(text: string): string {
  const matrix = encodeText(text, 'L')
  const n = matrix.length
  let path = ''
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (matrix[y][x]) path += `M${x},${y}h1v1h-1z`
  return path
}

async function imageToDataUrl(url: string): Promise<string | null> {
  if (!url) return null
  if (url.startsWith('data:')) return url
  try {
    const resp = await fetch(url, { mode: 'cors' })
    if (!resp.ok) return null
    const blob = await resp.blob()
    return new Promise<string | null>((res) => {
      const reader = new FileReader()
      reader.onloadend = () => res(reader.result as string)
      reader.onerror = () => res(null)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

// ─── Dynamic name sizing ──────────────────────────────────────────────────────
// Dark left area: x=290 → x=720 = 430px usable for name text.
// Barlow Condensed avg char width ≈ 0.52 × fontSize.
// Cap at 80px (matches 3D card proportions at SVG 1180/480 ≈ 2.46× scale).
const NAME_AREA_W = 430
const NAME_FS_MAX = 80
const NAME_FS_MIN = 26

function nameFs(text: string, capPx = NAME_FS_MAX): number {
  const fit = Math.floor(NAME_AREA_W / Math.max(text.length * 0.52, 1))
  return Math.max(NAME_FS_MIN, Math.min(capPx, fit))
}

// ─── Info pill ───────────────────────────────────────────────────────────────
function infoPill(
  x: number, y: number,
  label: string, value: string,
  accent: string, accentSoft: string,
  icon: 'pin' | 'phone' | 'building' | 'people',
): string {
  const icons: Record<string, string> = {
    pin:      `<circle cx="22" cy="16" r="4" fill="#fff"/><path d="M22 36s10-9 10-18a10 10 0 10-20 0c0 9 10 18 10 18z" fill="none" stroke="#fff" stroke-width="1.4" transform="translate(5 3) scale(0.7)"/>`,
    phone:    `<path d="M12 12h3l2.5 6-2.5 1c1 2.5 3.5 5 6 6l1-2.5 6 2.5v3c0 1-1 1.5-1.5 1.5-10 0-18-8-18-18 0-.5.5-1.5 1.5-1.5z" fill="#fff" transform="translate(6 6) scale(0.7)"/>`,
    building: `<path d="M8 32V12l14-9 14 9v20" fill="none" stroke="#fff" stroke-width="1.6" transform="translate(4 6) scale(0.65)"/><rect x="16" y="20" width="8" height="10" rx="1" fill="#fff" transform="scale(0.65) translate(4 6)"/>`,
    people:   `<circle cx="16" cy="16" r="5" fill="#fff" transform="translate(4 4) scale(0.7)"/><circle cx="28" cy="16" r="5" fill="#fff" transform="translate(4 4) scale(0.7)"/><path d="M6 30c0-4 3-6 6-6s6 2 6 6M20 30c0-4 3-6 6-6s4 1.5 4 4" fill="none" stroke="#fff" stroke-width="1.2" transform="translate(4 4) scale(0.7)"/>`,
  }
  return `<g transform="translate(${x} ${y})">
    <rect x="0" y="0" width="320" height="76" rx="16" fill="url(#pillGrad)" stroke="${escapeXml(accent)}" stroke-opacity="0.22"/>
    <g transform="translate(14 14)">
      <rect x="0" y="0" width="48" height="48" rx="12" fill="url(#iconGrad)"/>
      ${icons[icon]}
    </g>
    <text x="72" y="28" font-family="'Barlow Condensed','Barlow',Arial,sans-serif" font-weight="700" font-size="15" fill="${escapeXml(accentSoft)}" letter-spacing="1.4">${escapeXml(label)}</text>
    <text x="72" y="56" font-family="'Barlow','Barlow Condensed',Arial,sans-serif" font-weight="700" font-size="22" fill="#ffffff">${escapeXml(value)}</text>
  </g>`
}

// ─── SVG Generation ──────────────────────────────────────────────────────────

/**
 * Render the card to an SVG string.
 *
 * @param schema         Card data
 * @param photoDataUrl   Optional pre-fetched photo as data: URI (avoids CORS)
 * @param signatureDataUrl Optional pre-fetched signature as data: URI
 * @param fontStyle      Optional embedded @font-face CSS from loadEmbeddedFontStyle()
 */
export function renderToSvgString(
  schema: CardSchema,
  photoDataUrl?: string | null,
  signatureDataUrl?: string | null,
  fontStyle?: string,
): string {
  const { branding, member, styles, template } = schema
  const level      = getLevelTheme(member.level)
  const accent     = styles.accentColor || '#1ed760'
  const accentSoft = lighten(accent, 0.25)
  const onDark     = styles.textColor || '#ffffff'

  const title    = (template?.title || 'CARTE DE MEMBRE').toUpperCase()
  const subtitle = template?.subtitle || branding.faitiereName

  const expiryText = member.expiryDate
    ? new Date(member.expiryDate)
        .toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
        .toUpperCase()
    : '—'

  const startYear  = member.createdAt  ? new Date(member.createdAt).getFullYear()  : new Date().getFullYear()
  const endYear    = member.expiryDate ? new Date(member.expiryDate).getFullYear() : startYear + 1
  const periodText = `${startYear} – ${endYear}`

  const qrPayload       = `https://www.faitierehub.com/verify/${encodeURIComponent(member.cardNumber)}`
  const qrPath          = generateQrSvgPath(qrPayload)
  const qrModuleCount   = encodeText(qrPayload, 'L').length

  // ── Name dynamic sizing ───────────────────────────────────────────────────
  // firstName and lastName are on separate lines — size each independently.
  const firstFs       = nameFs(member.firstName)
  const lastFs        = nameFs(member.lastName.toUpperCase())
  const nameBlockH    = firstFs + lastFs + 12   // 12px gap between lines

  // ── Photo ─────────────────────────────────────────────────────────────────
  // Rounded-rectangle clip — portrait format (3:4 ratio), matching card-3d.tsx.
  // Frame: x=48 y=140, width=236 height=314, rx=20
  const resolvedPhoto = photoDataUrl || member.photoUrl
  const photoContent  = resolvedPhoto
    ? `<g clip-path="url(#photoClip)"><image href="${escapeXml(resolvedPhoto)}" xlink:href="${escapeXml(resolvedPhoto)}" x="48" y="140" width="236" height="314" preserveAspectRatio="xMidYMin slice"/></g>`
    : `<g clip-path="url(#photoClip)">
        <rect x="48" y="140" width="236" height="314" fill="${darken(accent, 0.55)}"/>
        <g transform="translate(166 294)" fill="${accentSoft}" opacity="0.55">
          <circle cx="0" cy="-30" r="34"/>
          <path d="M-66 66 C -66 16, 66 16, 66 66 Z"/>
        </g>
      </g>`

  // ── Background gradient ───────────────────────────────────────────────────
  const bgStops = (schema.background.gradient ?? [
    { offset: 0, color: lighten(accent, 0.1) },
    { offset: 1, color: '#04140b' },
  ]).map((s) => `<stop offset="${s.offset * 100}%" stop-color="${escapeXml(s.color)}"/>`).join('')

  // ── Right panel: signature ────────────────────────────────────────────────
  // Panel inner group starts at translate(770 44).
  // Layout (y values within this group):
  //   0–55   : Title + subtitle
  //   58–90  : Verified badge (h=32)
  //   100–150: N° membre + Valable (2 cols)
  //   160–208: Statut + Période (2 cols)
  //   218–258: Coopérative
  //   268–342: Signature zone (label + image/text)
  //   352–572: QR code (220×220)
  //   580–610: QR labels
  // Total ≈ 610px < 696px (740-44) ✓

  const resolvedSig = signatureDataUrl || member.signatureUrl
  const sigBlock = resolvedSig
    ? `<image href="${escapeXml(resolvedSig)}" xlink:href="${escapeXml(resolvedSig)}" x="0" y="15" width="380" height="60" preserveAspectRatio="xMinYMid meet"/>`
    : `<text x="0" y="68" font-family="'Caveat','Segoe Script',cursive" font-weight="600" font-size="36" fill="${escapeXml(darken(accent, 0.55))}">${escapeXml(member.firstName)}</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1180 740" width="1180" height="740">
  <defs>
    ${fontStyle ? `<style>${fontStyle}</style>` : ''}
    <radialGradient id="bgGrad" cx="26%" cy="34%" r="92%">${bgStops}</radialGradient>
    <radialGradient id="haloGrad" cx="22%" cy="40%" r="42%">
      <stop offset="0%" stop-color="${escapeXml(accent)}" stop-opacity="0.30"/>
      <stop offset="70%" stop-color="${escapeXml(accent)}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${escapeXml(accentSoft)}"/>
      <stop offset="0.6" stop-color="${escapeXml(accent)}"/>
      <stop offset="1" stop-color="${escapeXml(darken(accent, 0.5))}"/>
    </linearGradient>
    <linearGradient id="panelGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f1f7ef" stop-opacity="0"/>
      <stop offset=".22" stop-color="#f6faf4" stop-opacity=".97"/>
      <stop offset="1" stop-color="#e6f0e4"/>
    </linearGradient>
    <linearGradient id="pillGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${escapeXml(lighten(accent, 0.05))}" stop-opacity=".18"/>
      <stop offset="1" stop-color="#04140b" stop-opacity=".30"/>
    </linearGradient>
    <linearGradient id="iconGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${escapeXml(accentSoft)}"/>
      <stop offset="1" stop-color="${escapeXml(darken(accent, 0.2))}"/>
    </linearGradient>
    <linearGradient id="orGrad"     x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd95e"/><stop offset="1" stop-color="#e0a106"/></linearGradient>
    <linearGradient id="silverGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef2f5"/><stop offset="1" stop-color="#aeb9c2"/></linearGradient>
    <linearGradient id="bronzeGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6a86a"/><stop offset="1" stop-color="#9c6b3f"/></linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="13" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="4"/>
      <feOffset dy="4"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.32"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="cardClip"><rect x="0" y="0" width="1180" height="740" rx="30" ry="30"/></clipPath>
    <clipPath id="photoClip"><rect x="48" y="140" width="236" height="314" rx="20" ry="20"/></clipPath>
    <pattern id="kente" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="56" height="56" fill="none"/>
      <path d="M0 28 H56 M28 0 V56" stroke="${escapeXml(accent)}" stroke-width="2" stroke-opacity="0.10"/>
      <circle cx="28" cy="28" r="4" fill="${escapeXml(accent)}" fill-opacity="0.08"/>
    </pattern>
  </defs>

  <g clip-path="url(#cardClip)">
    <!-- Background -->
    <rect x="0" y="0" width="1180" height="740" fill="url(#bgGrad)"/>
    <rect x="0" y="0" width="720" height="740" fill="url(#kente)"/>
    <rect x="0" y="0" width="1180" height="740" fill="url(#haloGrad)"/>

    <!-- Decorative leaf filigrane -->
    <g opacity="0.08" transform="translate(-30 470) rotate(8) scale(3)">
      <path d="M50 5C30 20 15 45 20 75c2 12 8 18 8 18s-2-30 12-48C58 25 72 18 72 18S60 10 50 5z" fill="${escapeXml(accentSoft)}"/>
    </g>

    <!-- Top accent ribbon -->
    <rect x="0" y="0" width="720" height="8" fill="${escapeXml(accent)}"/>

    <!-- ═══ RIGHT PANEL ═══ -->
    <path d="M750 0 L1180 0 L1180 740 L750 740 C730 740 720 720 720 700 L720 40 C720 20 730 0 750 0 Z" fill="url(#panelGrad)"/>

    <!-- ── Panel content ── -->
    <g transform="translate(770 44)" font-family="'Barlow Condensed','Barlow',Arial,sans-serif">

      <!-- Title + Subtitle -->
      <text x="0" y="26" font-weight="800" font-size="21" fill="${escapeXml(darken(accent, 0.55))}" letter-spacing="3">${escapeXml(trunc(title, 28))}</text>
      <text x="0" y="48" font-family="'Barlow','Barlow Condensed',Arial,sans-serif" font-weight="700" font-size="13" fill="${escapeXml(darken(accent, 0.35))}" letter-spacing="1">${escapeXml(trunc(subtitle, 40))}</text>

      <!-- Verified badge -->
      <g transform="translate(0 58)" filter="url(#shadow)">
        <rect x="0" y="0" width="210" height="32" rx="16" fill="url(#iconGrad)"/>
        <circle cx="18" cy="16" r="8" fill="none" stroke="#fff" stroke-width="1.8"/>
        <path d="M14 16 l3 3 l5 -5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="34" y="21" font-weight="800" font-size="13" fill="#fff" letter-spacing="1.5">MEMBRE CERTIFIÉ</text>
      </g>

      <!-- N° Membre + Valable -->
      <g transform="translate(0 105)">
        <text x="0"   y="0"  font-family="'Barlow','Barlow Condensed',Arial,sans-serif" font-weight="700" font-size="12" fill="${escapeXml(darken(accent, 0.35))}" letter-spacing="2">N° DE MEMBRE</text>
        <text x="0"   y="26" font-weight="800" font-size="24" fill="${escapeXml(darken(accent, 0.65))}" font-variant-numeric="tabular-nums">${escapeXml(member.cardNumber)}</text>
        <text x="205" y="0"  font-family="'Barlow','Barlow Condensed',Arial,sans-serif" font-weight="700" font-size="12" fill="${escapeXml(darken(accent, 0.35))}" letter-spacing="2">VALABLE JUSQU'AU</text>
        <text x="205" y="26" font-weight="800" font-size="22" fill="${escapeXml(darken(accent, 0.65))}">${escapeXml(expiryText)}</text>
      </g>

      <!-- Statut + Période -->
      <g transform="translate(0 162)">
        <text x="0"   y="0"  font-family="'Barlow','Barlow Condensed',Arial,sans-serif" font-weight="700" font-size="12" fill="${escapeXml(darken(accent, 0.35))}" letter-spacing="2">STATUT</text>
        <text x="0"   y="26" font-weight="800" font-size="22" fill="${escapeXml(darken(accent, 0.2))}">ACTIF</text>
        <text x="205" y="0"  font-family="'Barlow','Barlow Condensed',Arial,sans-serif" font-weight="700" font-size="12" fill="${escapeXml(darken(accent, 0.35))}" letter-spacing="2">PÉRIODE D'ADHÉSION</text>
        <text x="205" y="26" font-weight="800" font-size="22" fill="${escapeXml(darken(accent, 0.65))}">${escapeXml(periodText)}</text>
      </g>

      <!-- Coopérative -->
      <g transform="translate(0 215)">
        <text x="0" y="0"  font-family="'Barlow','Barlow Condensed',Arial,sans-serif" font-weight="700" font-size="12" fill="${escapeXml(darken(accent, 0.35))}" letter-spacing="2">COOPÉRATIVE</text>
        <text x="0" y="24" font-weight="800" font-size="18" fill="${escapeXml(darken(accent, 0.65))}">${escapeXml(trunc(branding.cooperativeName, 26))}</text>
      </g>

      <!-- ── Signature ── (zone dédiée, aucun overlap avec QR) -->
      <g transform="translate(0 268)">
        <text x="0" y="0" font-family="'Barlow','Barlow Condensed',Arial,sans-serif" font-weight="700" font-size="12" fill="${escapeXml(darken(accent, 0.35))}" letter-spacing="2">SIGNATURE</text>
        <!-- Ligne de signature -->
        <line x1="0" y1="88" x2="380" y2="88" stroke="${escapeXml(darken(accent, 0.3))}" stroke-width="0.8" stroke-opacity="0.4"/>
        ${sigBlock}
      </g>

      <!-- ── QR Code ── (décalé sous la signature, gap 10px après ligne) -->
      <g transform="translate(0 368)">
        <rect x="0" y="0" width="214" height="214" rx="14" fill="#ffffff" filter="url(#shadow)"/>
        <g transform="translate(7 7)">
          <svg viewBox="0 0 ${qrModuleCount} ${qrModuleCount}" width="200" height="200" shape-rendering="crispEdges">
            <rect width="100%" height="100%" fill="#ffffff"/>
            <path d="${qrPath}" fill="#000000"/>
          </svg>
        </g>
        <text x="0" y="234" font-weight="800" font-size="15" fill="${escapeXml(darken(accent, 0.6))}" letter-spacing="1.2">SCANNER POUR VÉRIFIER</text>
        <text x="0" y="253" font-family="'Barlow','Barlow Condensed',Arial,sans-serif" font-weight="700" font-size="12" fill="${escapeXml(darken(accent, 0.25))}" letter-spacing="0.8">SÉCURISÉ · CERTIFIÉ · FAITIEREHUB</text>
      </g>
    </g>

    <!-- ═══ LEFT SIDE ═══ -->
    <!-- Brand top-left -->
    <g transform="translate(36 28)">
      <circle cx="22" cy="22" r="22" fill="url(#iconGrad)" filter="url(#shadow)"/>
      <path d="M22 10C18 13 15 17 16 22c.4 2.5 1.6 3.8 1.6 3.8S17 20 20 16c2-3 5-4.2 5-4.2S24 11 22 10z" fill="#fff"/>
      <text x="54" y="18" font-family="'Barlow Condensed','Barlow',Arial,sans-serif" font-weight="800" font-size="24" fill="${escapeXml(onDark)}">Faîtière</text>
      <text x="158" y="18" font-family="'Barlow Condensed','Barlow',Arial,sans-serif" font-weight="800" font-size="24" fill="${escapeXml(accentSoft)}">Hub</text>
    </g>

    <!-- Photo frame (rounded rect, portrait 3:4) -->
    <rect x="44" y="136" width="244" height="322" rx="23" ry="23" fill="url(#ringGrad)" filter="url(#glow)"/>
    <rect x="46" y="138" width="240" height="318" rx="22" ry="22" fill="${escapeXml(darken(accent, 0.5))}"/>
    ${photoContent}
    <rect x="48" y="140" width="236" height="314" rx="20" ry="20" fill="none" stroke="#ffffff" stroke-opacity="0.15" stroke-width="2"/>

    <!-- Name block -->
    <g transform="translate(290 90)" font-family="'Barlow Condensed','Barlow',Arial,sans-serif">
      <text x="0" y="${firstFs}" font-weight="800" font-size="${firstFs}" fill="${escapeXml(onDark)}">${escapeXml(member.firstName)}</text>
      <text x="0" y="${firstFs + lastFs + 8}" font-weight="900" font-size="${lastFs}" fill="${escapeXml(accentSoft)}">${escapeXml(member.lastName.toUpperCase())}</text>

      <!-- Level + active pills -->
      <g transform="translate(0 ${nameBlockH + 16})">
        <rect x="0" y="0" width="172" height="32" rx="16" fill="${level.fill}" filter="url(#shadow)"/>
        ${medallionMark(20, 16, level.ring)}
        <text x="38" y="22" font-weight="800" font-size="14" fill="${level.textColor}" letter-spacing="1.4">${level.label}</text>
        <g transform="translate(184 0)">
          <rect x="0" y="0" width="150" height="32" rx="16" fill="${escapeXml(accent)}" fill-opacity="0.18" stroke="${escapeXml(accentSoft)}" stroke-opacity="0.5"/>
          <circle cx="14" cy="16" r="4" fill="${escapeXml(accentSoft)}"/>
          <text x="26" y="21" font-weight="800" font-size="13" fill="${escapeXml(accentSoft)}" letter-spacing="1.5">MEMBRE ACTIF</text>
        </g>
      </g>

      <!-- Cooperative line under pills -->
      <text x="0" y="${nameBlockH + 62}" font-family="'Barlow','Barlow Condensed',Arial,sans-serif" font-weight="700" font-size="16" fill="${escapeXml(accentSoft)}" letter-spacing="0.5">COOPÉRATIVE : <tspan fill="${escapeXml(onDark)}" font-weight="800">${escapeXml(trunc(branding.cooperativeName, 28))}</tspan></text>
    </g>

    <!-- Info pills (2×2 grid, bottom-left — below photo frame which ends y=454) -->
    <g transform="translate(44 466)">
      ${infoPill(  0,  0, 'LOCALITÉ',    trunc(member.locality || '—', 24), accent, accentSoft, 'pin')}
      ${infoPill(334,  0, 'TÉLÉPHONE',   member.phone || '—',              accent, accentSoft, 'phone')}
      ${infoPill(  0, 88, 'COOPÉRATIVE', trunc(branding.cooperativeName, 24), accent, accentSoft, 'building')}
      ${infoPill(334, 88, 'FAÎTIÈRE',    trunc(branding.faitiereName, 24),  accent, accentSoft, 'people')}
    </g>
  </g>
</svg>`
}

// ─── Rasterization (SVG → Canvas → PNG) ─────────────────────────────────────

async function svgToCanvas(svgString: string): Promise<HTMLCanvasElement> {
  const W = 1180 * 2
  const H = 740  * 2
  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url  = URL.createObjectURL(blob)

  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, W, H)
      URL.revokeObjectURL(url)
      resolve(canvas)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG → canvas failed')) }
    img.src = url
  })
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function renderToCanvas(schema: CardSchema): Promise<HTMLCanvasElement> {
  const [photoDataUrl, signatureDataUrl, fontStyle] = await Promise.all([
    schema.member.photoUrl      ? imageToDataUrl(schema.member.photoUrl)      : Promise.resolve(null),
    schema.member.signatureUrl  ? imageToDataUrl(schema.member.signatureUrl)  : Promise.resolve(null),
    loadEmbeddedFontStyle(),
  ])
  const svg = renderToSvgString(schema, photoDataUrl, signatureDataUrl, fontStyle)
  return svgToCanvas(svg)
}

export async function renderToPng(schema: CardSchema): Promise<Blob> {
  const canvas = await renderToCanvas(schema)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => { if (blob) resolve(blob); else reject(new Error('PNG blob failed')) },
      'image/png',
    )
  })
}

export async function downloadCard(schema: CardSchema, filename?: string): Promise<void> {
  const blob = await renderToPng(schema)
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename ?? `carte-${schema.member.cardNumber}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function renderToDataUrl(schema: CardSchema): Promise<string> {
  const canvas = await renderToCanvas(schema)
  return canvas.toDataURL('image/png')
}
