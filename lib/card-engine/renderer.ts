/**
 * Card Renderer Engine — SVG-based Premium Design
 * 
 * Design: Dark green gradient with organic shapes, light panel on right,
 * circular photo with gradient ring, info pills, QR code block.
 * 
 * SVG: 1180 × 740 (landscape)
 * 
 * Renders to SVG string, then rasterizes to PNG via canvas for download.
 */

import type { CardSchema } from './schema'
import { lighten, darken } from './schema'
import { encodeText } from '@/lib/utils/qr'

// ─── SVG Generation ─────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Truncate text to fit within a max character count */
function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + '…'
}

function getLevelTheme(level?: string): {
  label: string
  textColor: string
  fill: string
  ring: string
} {
  switch (level) {
    case 'or':
      return { label: 'NIVEAU OR', textColor: '#3d2c00', fill: 'url(#orGrad)', ring: '#e0a106' }
    case 'argent':
      return { label: 'NIVEAU ARGENT', textColor: '#2a3540', fill: 'url(#silverGrad)', ring: '#9aa6b0' }
    case 'bronze':
    default:
      return { label: 'NIVEAU BRONZE', textColor: '#3a1e08', fill: 'url(#bronzeGrad)', ring: '#9c6b3f' }
  }
}

/** Small medallion mark drawn in SVG (replaces emoji which don't rasterize). */
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
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (matrix[y][x]) {
        path += `M${x},${y}h1v1h-1z`
      }
    }
  }
  return path
}

/**
 * Convert an image URL to a base64 data URL for embedding in SVG.
 * This is needed because SVG rendered via <img> or Blob URL cannot load external images.
 */
async function imageToDataUrl(url: string): Promise<string | null> {
  if (!url) return null
  // Already a data URL
  if (url.startsWith('data:')) return url
  
  try {
    const response = await fetch(url, { mode: 'cors' })
    if (!response.ok) return null
    const blob = await response.blob()
    return new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export function renderToSvgString(schema: CardSchema, photoDataUrl?: string | null): string {
  const { branding, member, styles, template } = schema
  const level = getLevelTheme(member.level)

  // Theme colors — driven by the template so the editor actually changes output.
  const accent = styles.accentColor || '#1ed760'
  const accentSoft = lighten(accent, 0.25)
  const onDark = styles.textColor || '#ffffff'

  // Localized labels (West African francophone cooperatives).
  const title = (template?.title || 'CARTE DE MEMBRE').toUpperCase()
  const subtitle = template?.subtitle || branding.faitiereName

  // Format expiry date in French.
  const expiryText = member.expiryDate
    ? new Date(member.expiryDate)
        .toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
        .toUpperCase()
    : '—'

  const startYear = member.createdAt ? new Date(member.createdAt).getFullYear() : new Date().getFullYear()
  const endYear = member.expiryDate ? new Date(member.expiryDate).getFullYear() : startYear + 1
  const periodText = `${startYear} – ${endYear}`

  // QR code
  const qrPayload = `https://www.faitierehub.com/verify/${encodeURIComponent(member.cardNumber)}`
  const qrPath = generateQrSvgPath(qrPayload)
  const qrMatrix = encodeText(qrPayload, 'L')
  const qrModuleCount = qrMatrix.length

  // Name: adapt font size based on length
  const fullName = `${member.firstName} ${member.lastName.toUpperCase()}`
  const nameFontSize = fullName.length > 20 ? 42 : fullName.length > 15 ? 50 : 56

  // Photo handling — robust: data URL preferred (export), raw URL fallback
  // (server side), else an elegant placeholder silhouette. The image is clipped
  // to the circle and centered via xMidYMid slice (handles portrait & landscape).
  const resolvedPhotoUrl = photoDataUrl || member.photoUrl
  const photoContent = resolvedPhotoUrl
    ? `<image href="${escapeXml(resolvedPhotoUrl)}" xlink:href="${escapeXml(resolvedPhotoUrl)}" x="58" y="186" width="216" height="216" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)" />`
    : `<g clip-path="url(#photoClip)">
        <rect x="58" y="186" width="216" height="216" fill="${darken(accent, 0.55)}"/>
        <g transform="translate(166 300)" fill="${accentSoft}" opacity="0.55">
          <circle cx="0" cy="-30" r="34"/>
          <path d="M-66 66 C -66 16, 66 16, 66 66 Z"/>
        </g>
      </g>`

  // Build the background gradient stops from the schema.
  const bgStops = (schema.background.gradient ?? [
    { offset: 0, color: lighten(accent, 0.1) },
    { offset: 1, color: '#04140b' },
  ])
    .map((s) => `<stop offset="${s.offset * 100}%" stop-color="${escapeXml(s.color)}"/>`)
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1180 740" width="1180" height="740">
  <defs>
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
    <linearGradient id="orGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffd95e"/><stop offset="1" stop-color="#e0a106"/>
    </linearGradient>
    <linearGradient id="silverGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eef2f5"/><stop offset="1" stop-color="#aeb9c2"/>
    </linearGradient>
    <linearGradient id="bronzeGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e6a86a"/><stop offset="1" stop-color="#9c6b3f"/>
    </linearGradient>
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
    <clipPath id="photoClip"><circle cx="166" cy="294" r="104"/></clipPath>
    <!-- West African adinkra-inspired pattern tile (woven motif) -->
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

    <!-- Decorative leaf filigrane (cocoa / shea leaf — West African crops) -->
    <g opacity="0.08" transform="translate(-30 470) rotate(8) scale(3)">
      <path d="M50 5C30 20 15 45 20 75c2 12 8 18 8 18s-2-30 12-48C58 25 72 18 72 18S60 10 50 5z" fill="${escapeXml(accentSoft)}"/>
    </g>

    <!-- Top accent ribbon -->
    <rect x="0" y="0" width="720" height="8" fill="${escapeXml(accent)}"/>

    <!-- ═══ RIGHT PANEL ═══ -->
    <path d="M750 0 L1180 0 L1180 740 L750 740 C730 740 720 720 720 700 L720 40 C720 20 730 0 750 0 Z" fill="url(#panelGrad)"/>

    <g transform="translate(770 44)" font-family="'Barlow Condensed', Arial, sans-serif">
      <text x="0" y="24" font-weight="800" font-size="18" fill="${escapeXml(darken(accent, 0.55))}" letter-spacing="3">${escapeXml(truncate(title, 28))}</text>
      <text x="0" y="44" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="11" fill="${escapeXml(darken(accent, 0.35))}" letter-spacing="1">${escapeXml(truncate(subtitle, 40))}</text>

      <!-- Verified badge (FR) -->
      <g transform="translate(0 58)" filter="url(#shadow)">
        <rect x="0" y="0" width="210" height="32" rx="16" fill="url(#iconGrad)"/>
        <circle cx="18" cy="16" r="8" fill="none" stroke="#fff" stroke-width="1.8"/>
        <path d="M14 16 l3 3 l5 -5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="34" y="21" font-weight="700" font-size="12" fill="#fff" letter-spacing="1.5">MEMBRE CERTIFIÉ</text>
      </g>

      <!-- N° Membre + Valable jusqu'au -->
      <g transform="translate(0 118)">
        <text x="0" y="0" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="10" fill="${escapeXml(darken(accent, 0.35))}" letter-spacing="1.5">N° DE MEMBRE</text>
        <text x="0" y="22" font-weight="800" font-size="20" fill="${escapeXml(darken(accent, 0.6))}">${escapeXml(member.cardNumber)}</text>
        <text x="210" y="0" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="10" fill="${escapeXml(darken(accent, 0.35))}" letter-spacing="1.5">VALABLE JUSQU'AU</text>
        <text x="210" y="22" font-weight="800" font-size="20" fill="${escapeXml(darken(accent, 0.6))}">${escapeXml(expiryText)}</text>
      </g>

      <!-- Statut + Période -->
      <g transform="translate(0 176)">
        <text x="0" y="0" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="10" fill="${escapeXml(darken(accent, 0.35))}" letter-spacing="1.5">STATUT</text>
        <text x="0" y="22" font-weight="800" font-size="20" fill="${escapeXml(darken(accent, 0.15))}">ACTIF</text>
        <text x="210" y="0" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="10" fill="${escapeXml(darken(accent, 0.35))}" letter-spacing="1.5">PÉRIODE D'ADHÉSION</text>
        <text x="210" y="22" font-weight="800" font-size="20" fill="${escapeXml(darken(accent, 0.6))}">${escapeXml(periodText)}</text>
      </g>

      <!-- Signature -->
      <g transform="translate(0 230)">
        <text x="0" y="0" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="10" fill="${escapeXml(darken(accent, 0.35))}" letter-spacing="1.5">SIGNATURE</text>
        <text x="0" y="32" font-family="'Caveat', 'Segoe Script', cursive" font-weight="600" font-size="30" fill="${escapeXml(darken(accent, 0.6))}">${escapeXml(member.firstName)}</text>
      </g>

      <!-- QR Code (FR) — enlarged + pure black for reliable A7 print scanning -->
      <g transform="translate(0 270)">
        <rect x="0" y="0" width="220" height="220" rx="16" fill="#ffffff" filter="url(#shadow)"/>
        <g transform="translate(10 10)">
          <svg viewBox="0 0 ${qrModuleCount} ${qrModuleCount}" width="200" height="200" shape-rendering="crispEdges">
            <rect width="100%" height="100%" fill="#ffffff"/>
            <path d="${qrPath}" fill="#000000"/>
          </svg>
        </g>
        <text x="0" y="244" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="700" font-size="15" fill="${escapeXml(darken(accent, 0.6))}" letter-spacing="1.2">SCANNER POUR VÉRIFIER</text>
        <text x="0" y="262" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="9" fill="${escapeXml(darken(accent, 0.2))}" letter-spacing="0.8">SÉCURISÉ • CERTIFIÉ</text>
      </g>
    </g>

    <!-- ═══ LEFT SIDE ═══ -->
    <g transform="translate(36 28)">
      <circle cx="22" cy="22" r="22" fill="url(#iconGrad)" filter="url(#shadow)"/>
      <path d="M22 10C18 13 15 17 16 22c.4 2.5 1.6 3.8 1.6 3.8S17 20 20 16c2-3 5-4.2 5-4.2S24 11 22 10z" fill="#fff"/>
      <text x="54" y="18" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="800" font-size="24" fill="${escapeXml(onDark)}">Faîtière</text>
      <text x="158" y="18" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="800" font-size="24" fill="${escapeXml(accentSoft)}">Hub</text>
    </g>

    <!-- Photo ring -->
    <circle cx="166" cy="294" r="112" fill="url(#ringGrad)" filter="url(#glow)"/>
    <circle cx="166" cy="294" r="106" fill="${escapeXml(darken(accent, 0.5))}"/>
    ${photoContent}
    <circle cx="166" cy="294" r="104" fill="none" stroke="#ffffff" stroke-opacity="0.15" stroke-width="2"/>

    <!-- Name + status -->
    <g transform="translate(290 100)">
      <text x="0" y="0" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="800" font-size="${nameFontSize}" fill="${escapeXml(onDark)}">${escapeXml(truncate(fullName, 22))}</text>

      <!-- Level badge (SVG medallion, no emoji) -->
      <g transform="translate(0 18)">
        <rect x="0" y="0" width="172" height="32" rx="16" fill="${level.fill}" filter="url(#shadow)"/>
        ${medallionMark(20, 16, level.ring)}
        <text x="38" y="22" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="700" font-size="13" fill="${level.textColor}" letter-spacing="1.4">${level.label}</text>
      </g>

      <!-- Active pill -->
      <g transform="translate(184 18)">
        <rect x="0" y="0" width="150" height="32" rx="16" fill="${escapeXml(accent)}" fill-opacity="0.18" stroke="${escapeXml(accentSoft)}" stroke-opacity="0.5"/>
        <circle cx="14" cy="16" r="4" fill="${escapeXml(accentSoft)}"/>
        <text x="26" y="21" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="700" font-size="12" fill="${escapeXml(accentSoft)}" letter-spacing="1.5">MEMBRE ACTIF</text>
      </g>

      <text x="0" y="76" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="600" font-size="16" fill="${escapeXml(accentSoft)}" letter-spacing="0.5">COOPÉRATIVE : <tspan fill="${escapeXml(onDark)}" font-weight="700">${escapeXml(truncate(branding.cooperativeName, 25))}</tspan></text>
    </g>

    <!-- Info pills (2×2) -->
    <g transform="translate(44 430)">
      ${infoPill(0, 0, 'LOCALITÉ', truncate(member.locality || '—', 28), accent, accentSoft, 'pin')}
      ${infoPill(334, 0, 'TÉLÉPHONE', member.phone || '—', accent, accentSoft, 'phone')}
      ${infoPill(0, 80, 'COOPÉRATIVE', truncate(branding.cooperativeName, 28), accent, accentSoft, 'building')}
      ${infoPill(334, 80, 'FAÎTIÈRE', truncate(branding.faitiereName, 28), accent, accentSoft, 'people')}
    </g>
  </g>
</svg>`
}

/** Render one info pill with an icon. Keeps the renderer DRY and themeable. */
function infoPill(
  x: number,
  y: number,
  label: string,
  value: string,
  accent: string,
  accentSoft: string,
  icon: 'pin' | 'phone' | 'building' | 'people',
): string {
  const icons: Record<string, string> = {
    pin: `<circle cx="22" cy="16" r="4" fill="#fff"/><path d="M22 36s10-9 10-18a10 10 0 10-20 0c0 9 10 18 10 18z" fill="none" stroke="#fff" stroke-width="1.4" transform="translate(5 3) scale(0.7)"/>`,
    phone: `<path d="M12 12h3l2.5 6-2.5 1c1 2.5 3.5 5 6 6l1-2.5 6 2.5v3c0 1-1 1.5-1.5 1.5-10 0-18-8-18-18 0-.5.5-1.5 1.5-1.5z" fill="#fff" transform="translate(6 6) scale(0.7)"/>`,
    building: `<path d="M8 32V12l14-9 14 9v20" fill="none" stroke="#fff" stroke-width="1.6" transform="translate(4 6) scale(0.65)"/><rect x="16" y="20" width="8" height="10" rx="1" fill="#fff" transform="scale(0.65) translate(4 6)"/>`,
    people: `<circle cx="16" cy="16" r="5" fill="#fff" transform="translate(4 4) scale(0.7)"/><circle cx="28" cy="16" r="5" fill="#fff" transform="translate(4 4) scale(0.7)"/><path d="M6 30c0-4 3-6 6-6s6 2 6 6M20 30c0-4 3-6 6-6s4 1.5 4 4" fill="none" stroke="#fff" stroke-width="1.2" transform="translate(4 4) scale(0.7)"/>`,
  }
  return `<g transform="translate(${x} ${y})">
    <rect x="0" y="0" width="320" height="68" rx="16" fill="url(#pillGrad)" stroke="${escapeXml(accent)}" stroke-opacity="0.22"/>
    <g transform="translate(14 12)">
      <rect x="0" y="0" width="44" height="44" rx="12" fill="url(#iconGrad)"/>
      ${icons[icon]}
    </g>
    <text x="72" y="28" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="600" font-size="10" fill="${escapeXml(accentSoft)}" letter-spacing="1.6">${escapeXml(label)}</text>
    <text x="72" y="48" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="14" fill="#ffffff">${escapeXml(value)}</text>
  </g>`
}

// ─── Rasterization (SVG → Canvas → PNG) ─────────────────────────────────────

async function svgToCanvas(svgString: string): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = 1180 * 2
  canvas.height = 740 * 2
  const ctx = canvas.getContext('2d')!

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 1180 * 2, 740 * 2)
      URL.revokeObjectURL(url)
      resolve(canvas)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to render SVG to canvas'))
    }
    img.src = url
  })
}

// ─── Export Functions ────────────────────────────────────────────────────────

export async function renderToCanvas(schema: CardSchema): Promise<HTMLCanvasElement> {
  // Convert photo URL to data URL so it renders inside the SVG blob
  let photoDataUrl: string | null = null
  if (schema.member.photoUrl) {
    photoDataUrl = await imageToDataUrl(schema.member.photoUrl)
  }
  const svg = renderToSvgString(schema, photoDataUrl)
  return svgToCanvas(svg)
}

export async function renderToPng(schema: CardSchema): Promise<Blob> {
  const canvas = await renderToCanvas(schema)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to create PNG'))
    }, 'image/png')
  })
}

export async function downloadCard(schema: CardSchema, filename?: string): Promise<void> {
  const blob = await renderToPng(schema)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `carte-${schema.member.cardNumber}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function renderToDataUrl(schema: CardSchema): Promise<string> {
  const canvas = await renderToCanvas(schema)
  return canvas.toDataURL('image/png')
}
