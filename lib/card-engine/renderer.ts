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

function getLevelTheme(level?: string): { gradientId: string; icon: string; label: string; textColor: string; fill: string } {
  switch (level) {
    case 'or':
      return { gradientId: 'orGrad', icon: '🥇', label: 'NIVEAU OR', textColor: '#3d2c00', fill: 'url(#orGrad)' }
    case 'argent':
      return { gradientId: 'argentGrad', icon: '🥈', label: 'NIVEAU ARGENT', textColor: '#2a3540', fill: '#cfd8df' }
    case 'bronze':
    default:
      return { gradientId: 'bronzeGrad', icon: '🥉', label: 'NIVEAU BRONZE', textColor: '#3a1e08', fill: '#c2854f' }
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

export function renderToSvgString(schema: CardSchema): string {
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

  // Photo: either an image element or a placeholder silhouette
  const photoContent = member.photoUrl
    ? `<image href="${escapeXml(member.photoUrl)}" x="60" y="134" width="212" height="212" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)" />`
    : `<g clip-path="url(#photoClip)">
        <rect x="60" y="134" width="212" height="212" fill="#1d6b3c"/>
        <g transform="translate(166 240)" fill="#bfe9cc" opacity="0.6">
          <circle cx="0" cy="-22" r="28"/>
          <path d="M-56 56 C -56 12, 56 12, 56 56 Z"/>
        </g>
      </g>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 740" width="1180" height="740">
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
      <stop offset=".3" stop-color="#f1f7ef" stop-opacity=".95"/>
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
      <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
      <feOffset dy="6"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.4"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="cardClip"><rect x="0" y="0" width="1180" height="740" rx="34" ry="34"/></clipPath>
    <clipPath id="photoClip"><circle cx="166" cy="240" r="106"/></clipPath>
  </defs>

  <g clip-path="url(#cardClip)">
    <!-- Background -->
    <rect x="0" y="0" width="1180" height="740" fill="url(#bgGrad)"/>
    <rect x="0" y="0" width="1180" height="740" fill="url(#haloGrad)"/>

    <!-- Filigrane leaf -->
    <g opacity="0.09" transform="translate(-30 470) rotate(8) scale(3.3)">
      <path d="M50 5C30 20 15 45 20 75c2 12 8 18 8 18s-2-30 12-48C58 25 72 18 72 18S60 10 50 5z" fill="#3ee06a"/>
    </g>

    <!-- Logo -->
    <g transform="translate(44 36)">
      <circle cx="25" cy="25" r="25" fill="url(#iconGrad)" filter="url(#shadow)"/>
      <path d="M25 11C20 15 17 20 18 26c.5 3 2 4.5 2 4.5S19.5 23 23 18c2.5-3.5 6-5 6-5S27 12.5 25 11z" fill="#fff"/>
      <text x="62" y="22" font-family="'Barlow Condensed', sans-serif" font-weight="800" font-size="28" fill="#fff">Faîtiere</text>
      <text x="155" y="22" font-family="'Barlow Condensed', sans-serif" font-weight="800" font-size="28" fill="#3ee06a">Hub</text>
    </g>

    <!-- Photo ring -->
    <circle cx="166" cy="240" r="115" fill="url(#ringGrad)" filter="url(#glow)"/>
    <circle cx="166" cy="240" r="108" fill="#0c3d22"/>
    ${photoContent}

    <!-- Name + Status -->
    <g transform="translate(308 178)">
      <text x="0" y="0" font-family="'Barlow Condensed', sans-serif" font-weight="800" font-size="60" fill="#fff">${escapeXml(member.firstName)} ${escapeXml(member.lastName.toUpperCase())}</text>

      <!-- Level badge -->
      <g transform="translate(0 22)">
        <rect x="0" y="0" width="170" height="36" rx="18" fill="${level.fill}" filter="url(#shadow)"/>
        <text x="14" y="24" font-size="20">${level.icon}</text>
        <text x="42" y="25" font-family="'Barlow Condensed', sans-serif" font-weight="700" font-size="16" fill="${level.textColor}" letter-spacing="1.6">${level.label}</text>
      </g>

      <!-- Active member pill -->
      <g transform="translate(186 22)">
        <rect x="0" y="0" width="172" height="36" rx="18" fill="#27c24c" fill-opacity="0.18" stroke="#3ee06a" stroke-opacity="0.4"/>
        <circle cx="16" cy="18" r="5" fill="#3ee06a"/>
        <text x="30" y="24" font-family="'Barlow Condensed', sans-serif" font-weight="700" font-size="15" fill="#3ee06a" letter-spacing="1.8">MEMBRE ACTIF</text>
      </g>

      <!-- Cooperative -->
      <text x="0" y="92" font-family="'Barlow Condensed', sans-serif" font-weight="600" font-size="19" fill="#7fd99a" letter-spacing="0.6">COOPÉRATIVE : <tspan fill="#fff" font-weight="700">${escapeXml(branding.cooperativeName)}</tspan></text>
    </g>

    <!-- Info pills (2x2 grid) -->
    <g transform="translate(54 408)">
      <!-- Localité -->
      <g transform="translate(0 0)">
        <rect x="0" y="0" width="312" height="76" rx="18" fill="url(#pillGrad)" stroke="#3ee06a" stroke-opacity="0.22"/>
        <g transform="translate(16 14)">
          <rect x="0" y="0" width="48" height="48" rx="13" fill="url(#iconGrad)" filter="url(#shadow)"/>
          <path d="M24 41s14-13 14-24a14 14 0 10-28 0c0 11 14 24 14 24z" fill="none" stroke="#fff" stroke-width="1.8" transform="scale(0.5)"/>
          <circle cx="12" cy="10" r="2.4" fill="#fff"/>
        </g>
        <text x="80" y="32" font-family="'Barlow Condensed', sans-serif" font-weight="600" font-size="11" fill="#7fd99a" letter-spacing="1.8">LOCALITÉ</text>
        <text x="80" y="54" font-family="'Barlow', sans-serif" font-weight="600" font-size="16" fill="#fff">${escapeXml(member.locality || '—')}</text>
      </g>
      <!-- Téléphone -->
      <g transform="translate(332 0)">
        <rect x="0" y="0" width="312" height="76" rx="18" fill="url(#pillGrad)" stroke="#3ee06a" stroke-opacity="0.22"/>
        <g transform="translate(16 14)">
          <rect x="0" y="0" width="48" height="48" rx="13" fill="url(#iconGrad)" filter="url(#shadow)"/>
          <path d="M14 14h4l3 7-3 1c1 3 4 6 7 7l1-3 7 3v4c0 1-1 2-2 2-12 0-22-10-22-22 0-1 1-2 2-2z" fill="#fff" transform="scale(0.7)"/>
        </g>
        <text x="80" y="32" font-family="'Barlow Condensed', sans-serif" font-weight="600" font-size="11" fill="#7fd99a" letter-spacing="1.8">TÉLÉPHONE</text>
        <text x="80" y="54" font-family="'Barlow', sans-serif" font-weight="600" font-size="16" fill="#fff">${escapeXml(member.phone || '—')}</text>
      </g>
      <!-- Coopérative -->
      <g transform="translate(0 90)">
        <rect x="0" y="0" width="312" height="76" rx="18" fill="url(#pillGrad)" stroke="#3ee06a" stroke-opacity="0.22"/>
        <g transform="translate(16 14)">
          <rect x="0" y="0" width="48" height="48" rx="13" fill="url(#iconGrad)" filter="url(#shadow)"/>
          <path d="M6 36V14l16-10 16 10v22" fill="none" stroke="#fff" stroke-width="2" transform="scale(0.7)"/>
          <rect x="10" y="15" width="8" height="10" fill="#fff" transform="scale(0.7)"/>
        </g>
        <text x="80" y="32" font-family="'Barlow Condensed', sans-serif" font-weight="600" font-size="11" fill="#7fd99a" letter-spacing="1.8">COOPÉRATIVE</text>
        <text x="80" y="54" font-family="'Barlow', sans-serif" font-weight="600" font-size="16" fill="#fff">${escapeXml(branding.cooperativeName)}</text>
      </g>
      <!-- Faîtière -->
      <g transform="translate(332 90)">
        <rect x="0" y="0" width="312" height="76" rx="18" fill="url(#pillGrad)" stroke="#3ee06a" stroke-opacity="0.22"/>
        <g transform="translate(16 14)">
          <rect x="0" y="0" width="48" height="48" rx="13" fill="url(#iconGrad)" filter="url(#shadow)"/>
          <circle cx="11" cy="12" r="3.5" fill="#fff"/>
          <circle cx="22" cy="12" r="3.5" fill="#fff"/>
          <path d="M4 28c0-4 3-6 6-6s6 2 6 6M16 28c0-4 3-6 6-6s4 1.5 4 4.5" fill="none" stroke="#fff" stroke-width="1.3"/>
        </g>
        <text x="80" y="32" font-family="'Barlow Condensed', sans-serif" font-weight="600" font-size="11" fill="#7fd99a" letter-spacing="1.8">FAÎTIÈRE</text>
        <text x="80" y="54" font-family="'Barlow', sans-serif" font-weight="600" font-size="15" fill="#fff">${escapeXml(branding.faitiereName)}</text>
      </g>
    </g>

    <!-- Right panel (light curved shape) -->
    <g>
      <path d="M1180 0 L1180 740 L824 740 C784 600 802 430 794 290 C786 175 808 78 846 0 Z" fill="url(#panelGrad)"/>

      <g transform="translate(864 50)" font-family="'Barlow Condensed', sans-serif">
        <!-- Title -->
        <text x="0" y="22" font-weight="800" font-size="25" fill="#0a3a1f" letter-spacing="4">MEMBER IDENTITY PASS</text>
        <text x="0" y="42" font-family="'Barlow', sans-serif" font-weight="600" font-size="12" fill="#3d7a52" letter-spacing="1.2">${escapeXml(branding.faitiereName)}</text>

        <!-- Verified badge -->
        <g transform="translate(0 56)" filter="url(#shadow)">
          <rect x="0" y="0" width="206" height="36" rx="18" fill="url(#iconGrad)"/>
          <circle cx="20" cy="18" r="9" fill="none" stroke="#fff" stroke-width="2"/>
          <path d="M16 18 l3 3 l5 -5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
          <text x="36" y="24" font-weight="700" font-size="14" fill="#fff" letter-spacing="2.2">VERIFIED MEMBER</text>
        </g>

        <!-- Member ID + Valid Until -->
        <g transform="translate(0 122)">
          <text x="0" y="0" font-family="'Barlow', sans-serif" font-weight="600" font-size="11" fill="#3d7a52" letter-spacing="1.5">MEMBER ID</text>
          <text x="0" y="26" font-weight="800" font-size="22" fill="#0a3a1f">${escapeXml(member.cardNumber)}</text>
          <text x="160" y="0" font-family="'Barlow', sans-serif" font-weight="600" font-size="11" fill="#3d7a52" letter-spacing="1.5">VALID UNTIL</text>
          <text x="160" y="26" font-weight="800" font-size="22" fill="#0a3a1f">${escapeXml(expiryText)}</text>
        </g>

        <!-- Status + Period -->
        <g transform="translate(0 188)">
          <text x="0" y="0" font-family="'Barlow', sans-serif" font-weight="600" font-size="11" fill="#3d7a52" letter-spacing="1.5">MEMBERSHIP STATUS</text>
          <text x="0" y="26" font-weight="800" font-size="22" fill="#15813f">ACTIVE</text>
          <text x="160" y="0" font-family="'Barlow', sans-serif" font-weight="600" font-size="11" fill="#3d7a52" letter-spacing="1.5">MEMBERSHIP PERIOD</text>
          <text x="160" y="26" font-weight="800" font-size="22" fill="#0a3a1f">${escapeXml(periodText)}</text>
        </g>

        <!-- Digital Signature -->
        <g transform="translate(0 254)">
          <text x="0" y="0" font-family="'Barlow', sans-serif" font-weight="600" font-size="11" fill="#3d7a52" letter-spacing="1.5">DIGITAL SIGNATURE</text>
          <text x="0" y="38" font-family="'Caveat', cursive, sans-serif" font-weight="600" font-size="36" fill="#0a3a1f">${escapeXml(member.firstName)}</text>
        </g>

        <!-- QR Code -->
        <g transform="translate(0 320)">
          <rect x="0" y="0" width="120" height="120" rx="14" fill="#fff" filter="url(#shadow)"/>
          <g transform="translate(8 8)">
            <svg viewBox="0 0 ${qrModuleCount} ${qrModuleCount}" width="104" height="104" shape-rendering="crispEdges">
              <rect width="100%" height="100%" fill="#ffffff"/>
              <path d="${qrPath}" fill="#0a3a1f"/>
            </svg>
          </g>
          <text x="140" y="40" font-family="'Barlow Condensed', sans-serif" font-weight="700" font-size="17" fill="#0a3a1f" letter-spacing="2">SCAN TO VERIFY</text>
          <text x="140" y="64" font-family="'Barlow', sans-serif" font-weight="600" font-size="11" fill="#15813f" letter-spacing="1.1">SECURE • VERIFIED • TRUSTED</text>
        </g>
      </g>
    </g>

  </g>
</svg>`
}

// ─── Rasterization (SVG → Canvas → PNG) ─────────────────────────────────────

async function svgToCanvas(svgString: string): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = 1180
  canvas.height = 740
  const ctx = canvas.getContext('2d')!

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 1180, 740)
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
  const svg = renderToSvgString(schema)
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
