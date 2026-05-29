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

function getLevelTheme(level?: string): { icon: string; label: string; textColor: string; fill: string } {
  switch (level) {
    case 'or':
      return { icon: '🥇', label: 'NIVEAU OR', textColor: '#3d2c00', fill: 'url(#orGrad)' }
    case 'argent':
      return { icon: '🥈', label: 'NIVEAU ARGENT', textColor: '#2a3540', fill: '#cfd8df' }
    case 'bronze':
    default:
      return { icon: '🥉', label: 'NIVEAU BRONZE', textColor: '#3a1e08', fill: '#c2854f' }
  }
}

function generateQrSvgPath(text: string): string {
  const matrix = encodeText(text, 'H')
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
  const { branding, member } = schema
  const level = getLevelTheme(member.level)

  // Format expiry date
  const expiryText = member.expiryDate
    ? new Date(member.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
    : '—'

  // Membership period
  const startYear = member.createdAt ? new Date(member.createdAt).getFullYear() : new Date().getFullYear()
  const endYear = member.expiryDate ? new Date(member.expiryDate).getFullYear() : startYear + 1
  const periodText = `${startYear} - ${endYear}`

  // QR code
  const qrPayload = `https://www.faitierehub.com/verify/${encodeURIComponent(member.cardNumber)}`
  const qrPath = generateQrSvgPath(qrPayload)
  const qrMatrix = encodeText(qrPayload, 'H')
  const qrModuleCount = qrMatrix.length

  // Name: adapt font size based on length
  const fullName = `${member.firstName} ${member.lastName.toUpperCase()}`
  const nameFontSize = fullName.length > 20 ? 42 : fullName.length > 15 ? 50 : 56

  // Photo: use data URL if provided, otherwise try the raw URL (for server-side), or placeholder
  const resolvedPhotoUrl = photoDataUrl || member.photoUrl
  const photoContent = resolvedPhotoUrl
    ? `<image href="${escapeXml(resolvedPhotoUrl)}" x="60" y="134" width="212" height="212" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)" />`
    : `<g clip-path="url(#photoClip)">
        <rect x="60" y="134" width="212" height="212" fill="#1d6b3c"/>
        <g transform="translate(166 240)" fill="#bfe9cc" opacity="0.6">
          <circle cx="0" cy="-22" r="28"/>
          <path d="M-56 56 C -56 12, 56 12, 56 56 Z"/>
        </g>
      </g>`

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1180 740" width="1180" height="740">
  <defs>
    <radialGradient id="bgGrad" cx="26%" cy="36%" r="80%">
      <stop offset="0%" stop-color="#115c30"/>
      <stop offset="40%" stop-color="#0c3a20"/>
      <stop offset="72%" stop-color="#0a2616"/>
      <stop offset="100%" stop-color="#04140b"/>
    </radialGradient>
    <radialGradient id="haloGrad" cx="22%" cy="42%" r="40%">
      <stop offset="0%" stop-color="#3ee06a" stop-opacity="0.28"/>
      <stop offset="70%" stop-color="#3ee06a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3ee06a"/>
      <stop offset="0.6" stop-color="#15813f"/>
      <stop offset="1" stop-color="#0c3d22"/>
    </linearGradient>
    <linearGradient id="panelGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f1f7ef" stop-opacity="0"/>
      <stop offset=".25" stop-color="#f1f7ef" stop-opacity=".95"/>
      <stop offset="1" stop-color="#e2efe1"/>
    </linearGradient>
    <linearGradient id="pillGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#145a32" stop-opacity=".55"/>
      <stop offset="1" stop-color="#082818" stop-opacity=".35"/>
    </linearGradient>
    <linearGradient id="iconGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#27c24c"/>
      <stop offset="1" stop-color="#15813f"/>
    </linearGradient>
    <linearGradient id="orGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffd95e"/>
      <stop offset="1" stop-color="#e0a106"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="14" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="4"/>
      <feOffset dy="4"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="cardClip"><rect x="0" y="0" width="1180" height="740" rx="28" ry="28"/></clipPath>
    <clipPath id="photoClip"><circle cx="166" cy="290" r="90"/></clipPath>
  </defs>

  <g clip-path="url(#cardClip)">
    <!-- Background -->
    <rect x="0" y="0" width="1180" height="740" fill="url(#bgGrad)"/>
    <rect x="0" y="0" width="1180" height="740" fill="url(#haloGrad)"/>

    <!-- Filigrane leaf -->
    <g opacity="0.07" transform="translate(-40 500) rotate(8) scale(3)">
      <path d="M50 5C30 20 15 45 20 75c2 12 8 18 8 18s-2-30 12-48C58 25 72 18 72 18S60 10 50 5z" fill="#3ee06a"/>
    </g>

    <!-- ═══ RIGHT PANEL (rendered first, behind left content) ═══ -->
    <path d="M750 0 L1180 0 L1180 740 L750 740 C730 740 720 720 720 700 L720 40 C720 20 730 0 750 0 Z" fill="url(#panelGrad)"/>

    <g transform="translate(755 40)" font-family="'Barlow Condensed', Arial, sans-serif">
      <!-- Title -->
      <text x="0" y="24" font-weight="800" font-size="18" fill="#0a3a1f" letter-spacing="3">MEMBER IDENTITY PASS</text>
      <text x="0" y="44" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="11" fill="#3d7a52" letter-spacing="1">${escapeXml(branding.faitiereName)}</text>

      <!-- Verified badge -->
      <g transform="translate(0 58)" filter="url(#shadow)">
        <rect x="0" y="0" width="190" height="32" rx="16" fill="url(#iconGrad)"/>
        <circle cx="18" cy="16" r="8" fill="none" stroke="#fff" stroke-width="1.8"/>
        <path d="M14 16 l3 3 l5 -5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="34" y="21" font-weight="700" font-size="12" fill="#fff" letter-spacing="2">VERIFIED MEMBER</text>
      </g>

      <!-- Member ID + Valid Until -->
      <g transform="translate(0 118)">
        <text x="0" y="0" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="10" fill="#3d7a52" letter-spacing="1.5">MEMBER ID</text>
        <text x="0" y="22" font-weight="800" font-size="20" fill="#0a3a1f">${escapeXml(member.cardNumber)}</text>
        <text x="200" y="0" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="10" fill="#3d7a52" letter-spacing="1.5">VALID UNTIL</text>
        <text x="200" y="22" font-weight="800" font-size="20" fill="#0a3a1f">${escapeXml(expiryText)}</text>
      </g>

      <!-- Status + Period -->
      <g transform="translate(0 176)">
        <text x="0" y="0" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="10" fill="#3d7a52" letter-spacing="1.5">MEMBERSHIP STATUS</text>
        <text x="0" y="22" font-weight="800" font-size="20" fill="#15813f">ACTIVE</text>
        <text x="200" y="0" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="10" fill="#3d7a52" letter-spacing="1.5">MEMBERSHIP PERIOD</text>
        <text x="200" y="22" font-weight="800" font-size="20" fill="#0a3a1f">${escapeXml(periodText)}</text>
      </g>

      <!-- Digital Signature -->
      <g transform="translate(0 230)">
        <text x="0" y="0" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="10" fill="#3d7a52" letter-spacing="1.5">DIGITAL SIGNATURE</text>
        <text x="0" y="32" font-family="'Caveat', 'Segoe Script', cursive" font-weight="600" font-size="30" fill="#0a3a1f">${escapeXml(member.firstName)}</text>
      </g>

      <!-- QR Code -->
      <g transform="translate(0 290)">
        <rect x="0" y="0" width="110" height="110" rx="12" fill="#fff" filter="url(#shadow)"/>
        <g transform="translate(7 7)">
          <svg viewBox="0 0 ${qrModuleCount} ${qrModuleCount}" width="96" height="96" shape-rendering="crispEdges">
            <rect width="100%" height="100%" fill="#ffffff"/>
            <path d="${qrPath}" fill="#0a3a1f"/>
          </svg>
        </g>
        <text x="126" y="38" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="700" font-size="14" fill="#0a3a1f" letter-spacing="1.5">SCAN TO</text>
        <text x="126" y="56" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="700" font-size="14" fill="#0a3a1f" letter-spacing="1.5">VERIFY</text>
        <text x="126" y="80" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="9" fill="#15813f" letter-spacing="0.8">SECURE • VERIFIED</text>
        <text x="126" y="94" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="9" fill="#15813f" letter-spacing="0.8">TRUSTED</text>
      </g>
    </g>

    <!-- ═══ LEFT SIDE — Logo, Photo, Name, Pills ═══ -->

    <!-- Logo -->
    <g transform="translate(36 28)">
      <circle cx="22" cy="22" r="22" fill="url(#iconGrad)" filter="url(#shadow)"/>
      <path d="M22 10C18 13 15 17 16 22c.4 2.5 1.6 3.8 1.6 3.8S17 20 20 16c2-3 5-4.2 5-4.2S24 11 22 10z" fill="#fff"/>
      <text x="54" y="18" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="800" font-size="24" fill="#fff">Faîtiere</text>
      <text x="138" y="18" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="800" font-size="24" fill="#3ee06a">Hub</text>
    </g>

    <!-- Photo ring -->
    <circle cx="166" cy="290" r="98" fill="url(#ringGrad)" filter="url(#glow)"/>
    <circle cx="166" cy="290" r="92" fill="#0c3d22"/>
    ${photoContent}

    <!-- Name + Status -->
    <g transform="translate(290 100)">
      <text x="0" y="0" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="800" font-size="${nameFontSize}" fill="#fff">${escapeXml(truncate(fullName, 22))}</text>

      <!-- Level badge -->
      <g transform="translate(0 18)">
        <rect x="0" y="0" width="160" height="32" rx="16" fill="${level.fill}" filter="url(#shadow)"/>
        <text x="12" y="22" font-size="16">${level.icon}</text>
        <text x="36" y="22" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="700" font-size="13" fill="${level.textColor}" letter-spacing="1.4">${level.label}</text>
      </g>

      <!-- Active member pill -->
      <g transform="translate(172 18)">
        <rect x="0" y="0" width="152" height="32" rx="16" fill="#27c24c" fill-opacity="0.18" stroke="#3ee06a" stroke-opacity="0.4"/>
        <circle cx="14" cy="16" r="4" fill="#3ee06a"/>
        <text x="26" y="21" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="700" font-size="12" fill="#3ee06a" letter-spacing="1.5">MEMBRE ACTIF</text>
      </g>

      <!-- Cooperative -->
      <text x="0" y="76" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="600" font-size="16" fill="#7fd99a" letter-spacing="0.5">COOPÉRATIVE : <tspan fill="#fff" font-weight="700">${escapeXml(truncate(branding.cooperativeName, 25))}</tspan></text>
    </g>

    <!-- Info pills (2×2 grid) -->
    <g transform="translate(44 430)">
      <!-- Localité -->
      <g transform="translate(0 0)">
        <rect x="0" y="0" width="320" height="68" rx="16" fill="url(#pillGrad)" stroke="#3ee06a" stroke-opacity="0.2"/>
        <g transform="translate(14 12)">
          <rect x="0" y="0" width="44" height="44" rx="12" fill="url(#iconGrad)"/>
          <circle cx="22" cy="16" r="4" fill="#fff"/>
          <path d="M22 36s10-9 10-18a10 10 0 10-20 0c0 9 10 18 10 18z" fill="none" stroke="#fff" stroke-width="1.4" transform="translate(5 3) scale(0.7)"/>
        </g>
        <text x="72" y="28" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="600" font-size="10" fill="#7fd99a" letter-spacing="1.6">LOCALITÉ</text>
        <text x="72" y="48" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="14" fill="#fff">${escapeXml(truncate(member.locality || '—', 28))}</text>
      </g>
      <!-- Téléphone -->
      <g transform="translate(334 0)">
        <rect x="0" y="0" width="320" height="68" rx="16" fill="url(#pillGrad)" stroke="#3ee06a" stroke-opacity="0.2"/>
        <g transform="translate(14 12)">
          <rect x="0" y="0" width="44" height="44" rx="12" fill="url(#iconGrad)"/>
          <path d="M12 12h3l2.5 6-2.5 1c1 2.5 3.5 5 6 6l1-2.5 6 2.5v3c0 1-1 1.5-1.5 1.5-10 0-18-8-18-18 0-.5.5-1.5 1.5-1.5z" fill="#fff" transform="translate(6 6) scale(0.7)"/>
        </g>
        <text x="72" y="28" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="600" font-size="10" fill="#7fd99a" letter-spacing="1.6">TÉLÉPHONE</text>
        <text x="72" y="48" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="14" fill="#fff">${escapeXml(member.phone || '—')}</text>
      </g>
      <!-- Coopérative -->
      <g transform="translate(0 80)">
        <rect x="0" y="0" width="320" height="68" rx="16" fill="url(#pillGrad)" stroke="#3ee06a" stroke-opacity="0.2"/>
        <g transform="translate(14 12)">
          <rect x="0" y="0" width="44" height="44" rx="12" fill="url(#iconGrad)"/>
          <path d="M8 32V12l14-9 14 9v20" fill="none" stroke="#fff" stroke-width="1.6" transform="translate(4 6) scale(0.65)"/>
          <rect x="16" y="20" width="8" height="10" rx="1" fill="#fff" transform="scale(0.65) translate(4 6)"/>
        </g>
        <text x="72" y="28" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="600" font-size="10" fill="#7fd99a" letter-spacing="1.6">COOPÉRATIVE</text>
        <text x="72" y="48" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="14" fill="#fff">${escapeXml(truncate(branding.cooperativeName, 28))}</text>
      </g>
      <!-- Faîtière -->
      <g transform="translate(334 80)">
        <rect x="0" y="0" width="320" height="68" rx="16" fill="url(#pillGrad)" stroke="#3ee06a" stroke-opacity="0.2"/>
        <g transform="translate(14 12)">
          <rect x="0" y="0" width="44" height="44" rx="12" fill="url(#iconGrad)"/>
          <circle cx="16" cy="16" r="5" fill="#fff" transform="translate(4 4) scale(0.7)"/>
          <circle cx="28" cy="16" r="5" fill="#fff" transform="translate(4 4) scale(0.7)"/>
          <path d="M6 30c0-4 3-6 6-6s6 2 6 6M20 30c0-4 3-6 6-6s4 1.5 4 4" fill="none" stroke="#fff" stroke-width="1.2" transform="translate(4 4) scale(0.7)"/>
        </g>
        <text x="72" y="28" font-family="'Barlow Condensed', Arial, sans-serif" font-weight="600" font-size="10" fill="#7fd99a" letter-spacing="1.6">FAÎTIÈRE</text>
        <text x="72" y="48" font-family="'Barlow', Arial, sans-serif" font-weight="600" font-size="14" fill="#fff">${escapeXml(truncate(branding.faitiereName, 28))}</text>
      </g>
    </g>

  </g>
</svg>`
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
