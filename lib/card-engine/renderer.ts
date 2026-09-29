/**
 * Card Renderer Engine — secure-document design.
 *
 * Canvas: 1180 × 740 (kept identical to the previous version so the A4 print
 * sheet in app/dashboard/cards/print and every existing consumer keep their
 * layout; the ratio 1.595 is within a hair of ID-1's 1.586).
 *
 * The visual language borrows from real identity documents rather than from
 * web UI: guilloché engraving, microtext, an iridescent foil patch, a contact
 * chip, and a deep multi-layer substrate. All of it is generated as SVG paths
 * in security-art.ts, so the inline preview, the PNG export and the printed
 * sheet are byte-for-byte the same drawing.
 *
 * Deliberate constraint: NO webfonts. An SVG rasterized through an <img> tag
 * (which is how renderToPng works) cannot fetch fonts or stylesheets, so a
 * `font-family: 'Barlow Condensed'` silently fell back to Arial and every
 * measurement based on the condensed metrics was wrong — that is what pushed
 * long names off the dark zone. Sizes here are computed against the metrics
 * that actually render.
 */

import type { CardSchema } from './schema'
import { lighten, darken } from './schema'
import { encodeText } from '@/lib/utils/qr'
import {
  esc,
  emblem,
  rosetteDef,
  useRosette,
  guillocheBand,
  microtext,
  chip,
  foilPatch,
  fitFontSize,
  wrapToTwoLines,
  estimateTextWidth,
} from './security-art'

const W = 1180
const H = 740
/** Where the dark identity zone ends and the light data panel begins. */
const SPLIT = 742

/**
 * Portrait window — a RECTANGLE, not a disc.
 *
 * Ratio is 7:9, the ISO/ICAO identity-photo ratio (35×45 mm) that every photo
 * booth, passport scanner and `components/shared/photo-upload` preview already
 * uses. A circle crops the ears and the shoulders out of a correctly-shot ID
 * portrait — the two things that make a face verifiable at a glance — and it
 * wastes the corners of the one large empty area the card has. The rectangle
 * fills that area and makes what the operator frames in the upload widget
 * EXACTLY what lands on the card, so there is no surprise at printing time.
 */
const PX = 48
const PW = 224
const PH = Math.round((PW * 9) / 7) // 288
const PY = 142
/** Frame bleed around the window: the engraved border sits in this margin. */
const PB = 7

/**
 * Font stack with NO quoted family names: this string is interpolated into a
 * double-quoted SVG attribute, so an inner `"Liberation Sans"` would close the
 * attribute early and void the whole declaration (the text then falls back to
 * the platform serif). Arial resolves through fontconfig to Liberation Sans on
 * Linux anyway, which is metric-compatible — which is what the width estimator
 * in security-art.ts is calibrated against.
 */
const SANS = 'Arial, Helvetica, sans-serif'

/**
 * Registration ticks at the four corners of the portrait window — the crop
 * marks of a printed identity document. They read as alignment marks rather
 * than decoration, and they tell the eye the photo is a controlled, framed
 * field of the document and not an avatar dropped onto a background.
 */
function cornerTicks(x: number, y: number, w: number, h: number, color: string): string {
  const L = 16
  const inset = 11
  const corners = [
    [x + inset, y + inset, 1, 1],
    [x + w - inset, y + inset, -1, 1],
    [x + inset, y + h - inset, 1, -1],
    [x + w - inset, y + h - inset, -1, -1],
  ]
  return corners
    .map(
      ([cx, cy, sx, sy]) =>
        `<path d="M${cx} ${cy + sy * L}V${cy}H${cx + sx * L}" fill="none" stroke="${esc(color)}" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="square"/>`,
    )
    .join('')
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return `${str.slice(0, max - 1)}…`
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
    default:
      return { label: 'NIVEAU BRONZE', textColor: '#3a1e08', fill: 'url(#bronzeGrad)', ring: '#9c6b3f' }
  }
}

/** Medallion used inside the level badge. */
function medallionMark(x: number, y: number, ring: string): string {
  return `<g transform="translate(${x} ${y})">
    <circle cx="0" cy="0" r="8.5" fill="#ffffff" fill-opacity="0.92"/>
    <circle cx="0" cy="0" r="8.5" fill="none" stroke="${esc(ring)}" stroke-width="1.6"/>
    <path d="M0 -4.6 L1.4 -1.4 L4.7 -1.4 L2 0.9 L3 4.2 L0 2.2 L-3 4.2 L-2 0.9 L-4.7 -1.4 L-1.4 -1.4 Z" fill="${esc(ring)}"/>
  </g>`
}

function generateQrSvgPath(text: string): string {
  const matrix = encodeText(text, 'H')
  const n = matrix.length
  let path = ''
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (matrix[y][x]) path += `M${x},${y}h1v1h-1z`
    }
  }
  return path
}

async function imageToDataUrl(url: string): Promise<string | null> {
  if (!url) return null
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

/** One labelled field in the right-hand data panel. */
function dataField(x: number, y: number, label: string, value: string, labelColor: string, valueColor: string, maxWidth: number): string {
  const { size } = fitFontSize(value, maxWidth, 19, 12, true)
  return `<g transform="translate(${x} ${y})">
    <text x="0" y="0" font-family="${SANS}" font-weight="700" font-size="9" fill="${esc(labelColor)}" letter-spacing="1.3">${esc(label)}</text>
    <text x="0" y="22" font-family="${SANS}" font-weight="700" font-size="${size}" fill="${esc(valueColor)}">${esc(value)}</text>
  </g>`
}

/** Compact info pill for the dark zone. Icons drawn on a normalized 24px grid. */
function infoPill(
  x: number,
  y: number,
  label: string,
  value: string,
  accent: string,
  accentSoft: string,
  icon: 'pin' | 'phone' | 'building' | 'people',
  width = 300,
): string {
  const icons: Record<string, string> = {
    pin: `<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" fill="none" stroke="#fff" stroke-width="1.7"/><circle cx="12" cy="10" r="2.6" fill="#fff"/>`,
    phone: `<path d="M6.5 4h3.2l1.7 4.1-2.2 1.3a11 11 0 0 0 5.4 5.4l1.3-2.2 4.1 1.7v3.2c0 .9-.8 1.6-1.7 1.5C10.9 18.3 5.7 13.1 5 5.7A1.6 1.6 0 0 1 6.5 4z" fill="#fff"/>`,
    building: `<path d="M4 20V10l8-5 8 5v10" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/><rect x="9.5" y="13" width="5" height="7" rx="1" fill="#fff"/>`,
    people: `<circle cx="9" cy="9" r="3.2" fill="#fff"/><circle cx="16.5" cy="10" r="2.6" fill="#fff"/><path d="M3.5 19c0-3.2 2.5-5 5.5-5s5.5 1.8 5.5 5" fill="none" stroke="#fff" stroke-width="1.7"/><path d="M16 14.5c2.4 0 4.5 1.4 4.5 4.5" fill="none" stroke="#fff" stroke-width="1.6"/>`,
  }
  // 82px is the icon plate plus its gutters; the rest is available to the text.
  const { size } = fitFontSize(value, width - 82, 14, 10, true)
  return `<g transform="translate(${x} ${y})">
    <rect x="0" y="0" width="${width}" height="62" rx="14" fill="url(#pillGrad)" stroke="${esc(accent)}" stroke-opacity="0.24"/>
    <rect x="0" y="0" width="${width}" height="31" rx="14" fill="#ffffff" fill-opacity="0.035"/>
    <g transform="translate(13 12)">
      <rect x="0" y="0" width="38" height="38" rx="11" fill="url(#iconGrad)"/>
      <g transform="translate(7 7)">${icons[icon]}</g>
    </g>
    <text x="63" y="26" font-family="${SANS}" font-weight="700" font-size="9" fill="${esc(accentSoft)}" letter-spacing="1.5">${esc(label)}</text>
    <text x="63" y="45" font-family="${SANS}" font-weight="700" font-size="${size}" fill="#ffffff">${esc(value)}</text>
  </g>`
}

export function renderToSvgString(schema: CardSchema, photoDataUrl?: string | null): string {
  const { branding, member, styles, template } = schema
  const level = getLevelTheme(member.level)

  const accent = styles.accentColor || '#1ed760'
  const accentSoft = lighten(accent, 0.25)
  const onDark = styles.textColor || '#ffffff'
  const ink = darken(accent, 0.62)
  const inkSoft = darken(accent, 0.3)

  const title = (template?.title || 'CARTE DE MEMBRE').toUpperCase()
  const subtitle = template?.subtitle || branding.faitiereName

  const expiryText = member.expiryDate
    ? new Date(member.expiryDate)
        .toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
        .toUpperCase()
    : '—'

  const startYear = member.createdAt ? new Date(member.createdAt).getFullYear() : new Date().getFullYear()
  const endYear = member.expiryDate ? new Date(member.expiryDate).getFullYear() : startYear + 1
  const periodText = `${startYear} – ${endYear}`

  const qrPayload = `https://www.faitierehub.com/verify/${encodeURIComponent(member.cardNumber)}`
  const qrPath = generateQrSvgPath(qrPayload)
  const qrModuleCount = encodeText(qrPayload, 'H').length

  // ── Name: measured, not character-counted ────────────────────────────────
  // Available width in the dark zone right of the photo, with a hard stop
  // before the panel edge.
  const NAME_X = 286
  const NAME_MAX_W = SPLIT - NAME_X - 34
  const fullName = `${member.firstName} ${member.lastName.toUpperCase()}`.trim()
  const firstPass = fitFontSize(fullName, NAME_MAX_W, 52, 30, true)
  const nameLines = firstPass.fits ? [fullName] : wrapToTwoLines(fullName, NAME_MAX_W, 38, true)
  const nameSize = firstPass.fits ? firstPass.size : fitFontSize(
    nameLines.reduce((a, b) => (estimateTextWidth(a, 38, true) > estimateTextWidth(b, 38, true) ? a : b)),
    NAME_MAX_W, 40, 26, true,
  ).size

  const photoSrc = photoDataUrl || member.photoUrl || ''
  const photoContent = photoSrc
    ? `<image href="${esc(photoSrc)}" xlink:href="${esc(photoSrc)}" x="${PX}" y="${PY}" width="${PW}" height="${PH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)"/>`
    : // Placeholder doubles as a framing guide: the silhouette sits exactly where
      // a correctly-shot head-and-shoulders portrait should land.
      `<g clip-path="url(#photoClip)">
        <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" fill="${esc(darken(accent, 0.58))}"/>
        <g transform="translate(${PX + PW / 2} ${PY + PH * 0.44})" fill="${esc(accentSoft)}" opacity="0.4">
          <circle cx="0" cy="-22" r="36"/>
          <path d="M-70 106 C -70 38, 70 38, 70 106 Z"/>
        </g>
      </g>`

  // ── Organisation emblems ──────────────────────────────────────────────────
  // Identity-document convention: the ISSUING authority's emblem occupies the
  // header, top-left, where the eye lands first; a second body is mirrored
  // top-right. The faîtière issues the card (the footer already reads
  // "DÉLIVRÉE PAR <faîtière>"), so it takes the issuer slot and the cooperative
  // the member belongs to is mirrored opposite.
  //
  // When only ONE logo exists it is promoted to the issuer slot rather than
  // left stranded on the right-hand side — a single emblem floating opposite an
  // empty header reads as a mistake, not as a design.
  const faitiereLogo = branding.faitiereLogoUrl || null
  const coopLogo = branding.cooperativeLogoUrl || null
  const issuerLogo = faitiereLogo ?? coopLogo
  // Only mirror the cooperative when it is not already the issuer emblem.
  const partnerLogo = faitiereLogo && coopLogo ? coopLogo : null
  const issuerIsFaitiere = Boolean(faitiereLogo)

  const issuerEmblem = issuerLogo
    ? emblem({ x: 0, y: 0, size: 44, href: issuerLogo, id: 'emblemIssuer' })
    : // No org logo: keep the platform's own sprouting-leaf mark rather than
      // leaving a hole. Nothing regresses for a cooperative that never uploads.
      `<circle cx="21" cy="21" r="21" fill="url(#iconGrad)" filter="url(#shadow)"/>
      <circle cx="21" cy="21" r="21" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1"/>
      <path d="M21 31.5 C 21 26, 21 20, 21 13.5" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" fill="none"/>
      <path d="M21 22 C 14.5 22, 10.5 18, 10.5 12.5 C 17 12.5, 21 16.5, 21 22 Z" fill="#ffffff" fill-opacity="0.95"/>
      <path d="M21 18 C 27.5 18, 31.5 14, 31.5 8.5 C 25 8.5, 21 12.5, 21 18 Z" fill="#ffffff" fill-opacity="0.7"/>`

  // With an organisation emblem in the header, "Faîtière Hub" beside it would
  // read as the platform's OWN logo — misattributing the cooperative's mark.
  // The organisation's name takes the wordmark instead; FaîtiereHub stays
  // present in the issuance line and the microtext at the foot of the card.
  const wordmarkName = issuerLogo
    ? (issuerIsFaitiere ? branding.faitiereName : branding.cooperativeName)
    : null
  const issuerWordmark = wordmarkName
    ? `<text x="56" y="19" font-family="${SANS}" font-weight="800" font-size="${fitFontSize(wordmarkName, 300, 21, 13, true).size}" fill="${esc(onDark)}" letter-spacing="-0.3">${esc(wordmarkName)}</text>
      <text x="56" y="36" font-family="${SANS}" font-weight="600" font-size="9.5" fill="${esc(accentSoft)}" letter-spacing="2.2" opacity="0.8">${esc(truncate((issuerIsFaitiere ? 'FAÎTIÈRE' : 'COOPÉRATIVE'), 30))}</text>`
    : `<text x="52" y="17" font-family="${SANS}" font-weight="800" font-size="22" fill="${esc(onDark)}" letter-spacing="-0.3">Faîtière</text>
      <text x="${52 + estimateTextWidth('Faîtière', 22, true) + 6}" y="17" font-family="${SANS}" font-weight="800" font-size="22" fill="${esc(accentSoft)}" letter-spacing="-0.3">Hub</text>
      <text x="52" y="34" font-family="${SANS}" font-weight="600" font-size="9.5" fill="${esc(accentSoft)}" letter-spacing="2.2" opacity="0.8">${esc(truncate(branding.faitiereName.toUpperCase(), 30))}</text>`

  // Mirrored slot: right-aligned against the inner edge of the dark zone.
  const PARTNER_SIZE = 40
  const PARTNER_X = SPLIT - 36 - PARTNER_SIZE
  const partnerEmblem = partnerLogo
    ? `<g transform="translate(0 32)">
        ${emblem({ x: PARTNER_X, y: 0, size: PARTNER_SIZE, href: partnerLogo, id: 'emblemPartner' })}
        <!-- Label only. The name itself is the affiliation line under the
             member's name, set large — repeating it here in 11px would be the
             third occurrence and the least readable of the three. -->
        <text x="${PARTNER_X - 12}" y="25" text-anchor="end" font-family="${SANS}" font-weight="700" font-size="10" fill="${esc(accentSoft)}" letter-spacing="2.4" opacity="0.85">COOPÉRATIVE</text>
      </g>`
    : ''

  const bgStops = (schema.background.gradient ?? [
    { offset: 0, color: lighten(accent, 0.1) },
    { offset: 1, color: '#04140b' },
  ])
    .map((s) => `<stop offset="${s.offset * 100}%" stop-color="${esc(s.color)}"/>`)
    .join('')

  const securityLine = `${branding.faitiereName} · ${member.cardNumber} · FAITIEREHUB`.toUpperCase()

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <radialGradient id="bgGrad" cx="24%" cy="30%" r="95%">${bgStops}</radialGradient>
    <radialGradient id="haloGrad" cx="20%" cy="38%" r="46%">
      <stop offset="0%" stop-color="${esc(accent)}" stop-opacity="0.26"/>
      <stop offset="72%" stop-color="${esc(accent)}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.02"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.07"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${esc(accentSoft)}"/>
      <stop offset="0.55" stop-color="${esc(accent)}"/>
      <stop offset="1" stop-color="${esc(darken(accent, 0.55))}"/>
    </linearGradient>
    <linearGradient id="panelGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.55" stop-color="#f7faf6"/>
      <stop offset="1" stop-color="#e9f1e7"/>
    </linearGradient>
    <linearGradient id="pillGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${esc(lighten(accent, 0.05))}" stop-opacity=".16"/>
      <stop offset="1" stop-color="#04140b" stop-opacity=".34"/>
    </linearGradient>
    <linearGradient id="iconGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${esc(accentSoft)}"/>
      <stop offset="1" stop-color="${esc(darken(accent, 0.22))}"/>
    </linearGradient>
    <linearGradient id="orGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffe98a"/><stop offset="0.5" stop-color="#f0bf3c"/><stop offset="1" stop-color="#cf8f05"/>
    </linearGradient>
    <linearGradient id="silverGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6f9fb"/><stop offset="0.5" stop-color="#cfd8df"/><stop offset="1" stop-color="#a3aeb8"/>
    </linearGradient>
    <linearGradient id="bronzeGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eeb782"/><stop offset="0.5" stop-color="#c08553"/><stop offset="1" stop-color="#94623a"/>
    </linearGradient>
    <linearGradient id="chipGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7e3a1"/><stop offset="0.45" stop-color="#d9b25c"/><stop offset="1" stop-color="#a97f28"/>
    </linearGradient>
    <linearGradient id="foilA" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7af5d0"/><stop offset="0.3" stop-color="#8bb8ff"/>
      <stop offset="0.6" stop-color="#e29bff"/><stop offset="1" stop-color="#ffd98a"/>
    </linearGradient>
    <linearGradient id="foilB" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.75"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#9ef7ff" stop-opacity="0.6"/>
    </linearGradient>

    <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="11" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3.5"/>
      <feOffset dy="3"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <!-- Substrate grain: breaks up flat gradient banding the way real card stock does -->
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" result="n"/>
      <feColorMatrix in="n" type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.055"/></feComponentTransfer>
    </filter>

    ${rosetteDef('rose')}
    <clipPath id="cardClip"><rect x="0" y="0" width="${W}" height="${H}" rx="30" ry="30"/></clipPath>
    <clipPath id="photoClip"><rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="14" ry="14"/></clipPath>
    <!-- Scrim: the photo fades into the card at the bottom instead of sitting
         on it like a pasted sticker, and picks up a light from the top-left
         matching the card's own sheen. -->
    <linearGradient id="photoScrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="0.30" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.72" stop-color="${esc(darken(accent, 0.72))}" stop-opacity="0"/>
      <stop offset="1" stop-color="${esc(darken(accent, 0.72))}" stop-opacity="0.42"/>
    </linearGradient>
    <clipPath id="darkClip"><rect x="0" y="0" width="${SPLIT}" height="${H}"/></clipPath>
    <clipPath id="panelClip"><rect x="${SPLIT}" y="0" width="${W - SPLIT}" height="${H}"/></clipPath>
    <clipPath id="foilClip"><rect width="86" height="58" rx="8"/></clipPath>
  </defs>

  <g clip-path="url(#cardClip)">
    <!-- ═══ SUBSTRATE ═══ -->
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bgGrad)"/>

    <g clip-path="url(#darkClip)">
      <!-- Guilloché engraving behind the identity zone. Kept faint: on a real
           document the engraving is a background texture you notice on close
           inspection, not a pattern competing with the portrait and the name. -->
      ${useRosette({ href: 'rose', cx: PX + PW / 2, cy: PY + PH / 2, scale: 2.45, color: accentSoft, opacity: 0.1, strokeWidth: 0.45 })}
      ${useRosette({ href: 'rose', cx: 596, cy: 214, scale: 1.75, color: accent, opacity: 0.075, strokeWidth: 0.45 })}
      <rect x="0" y="0" width="${SPLIT}" height="${H}" fill="url(#haloGrad)"/>
      <rect x="0" y="0" width="${SPLIT}" height="${H}" fill="url(#sheen)"/>
    </g>

    <!-- Top accent ribbon with woven guilloché band -->
    <rect x="0" y="0" width="${SPLIT}" height="10" fill="${esc(accent)}"/>
    <g clip-path="url(#darkClip)">
      ${guillocheBand({ x: 0, y: 10, width: SPLIT, height: 26, lines: 7, stroke: accentSoft, strokeWidth: 0.45, opacity: 0.28 })}
    </g>

    <!-- ═══ LIGHT DATA PANEL ═══ -->
    <path d="M${SPLIT + 26} 0 L${W} 0 L${W} ${H} L${SPLIT + 26} ${H} C${SPLIT + 4} ${H} ${SPLIT} ${H - 22} ${SPLIT} ${H - 44} L${SPLIT} 44 C${SPLIT} 22 ${SPLIT + 4} 0 ${SPLIT + 26} 0 Z" fill="url(#panelGrad)"/>
    <path d="M${SPLIT} 44 L${SPLIT} ${H - 44}" stroke="${esc(accent)}" stroke-opacity="0.35" stroke-width="2"/>
    <!-- Panel watermark: anchored in the bottom-right corner so it bleeds off
         the card edge. Floating it mid-panel left a pale ring in the middle of
         the data fields that read as a printing blemish rather than a
         security feature — and it must stay clear of the QR quiet zone. -->
    <g clip-path="url(#panelClip)">
      ${useRosette({ href: 'rose', cx: 1178, cy: 706, scale: 1.55, color: inkSoft, opacity: 0.12, strokeWidth: 0.35 })}
    </g>

    <g transform="translate(${SPLIT + 34} 46)">
      <text x="0" y="22" font-family="${SANS}" font-weight="800" font-size="19" fill="${esc(ink)}" letter-spacing="2.4">${esc(truncate(title, 26))}</text>
      <text x="0" y="42" font-family="${SANS}" font-weight="600" font-size="11" fill="${esc(inkSoft)}" letter-spacing="1.1">${esc(truncate(subtitle, 38))}</text>

      <g transform="translate(0 58)" filter="url(#shadow)">
        <rect x="0" y="0" width="206" height="31" rx="15.5" fill="url(#iconGrad)"/>
        <circle cx="17" cy="15.5" r="7.5" fill="none" stroke="#fff" stroke-width="1.7"/>
        <path d="M13.4 15.5 l2.6 2.6 l4.6 -4.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="33" y="20" font-family="${SANS}" font-weight="700" font-size="11.5" fill="#fff" letter-spacing="1.3">MEMBRE CERTIFIÉ</text>
      </g>

      ${dataField(0, 128, 'N° DE MEMBRE', member.cardNumber, inkSoft, ink, 186)}
      ${dataField(196, 128, "VALABLE JUSQU'AU", expiryText, inkSoft, ink, 170)}
      ${dataField(0, 188, 'STATUT', 'ACTIF', inkSoft, darken(accent, 0.18), 186)}
      ${dataField(196, 188, "PÉRIODE D'ADHÉSION", periodText, inkSoft, ink, 170)}

      <!-- Chip + holographic foil: the two physical security features -->
      <g transform="translate(0 232)">
        ${chip(0, 0, 52, 40)}
        ${foilPatch(72, -1, 86, 58, 'foil')}
        <text x="168" y="18" font-family="${SANS}" font-weight="700" font-size="8.5" fill="${esc(inkSoft)}" letter-spacing="1.1">ÉLÉMENT</text>
        <text x="168" y="31" font-family="${SANS}" font-weight="700" font-size="8.5" fill="${esc(inkSoft)}" letter-spacing="1.1">OPTIQUE</text>
        <text x="168" y="46" font-family="${SANS}" font-weight="700" font-size="8.5" fill="${esc(inkSoft)}" letter-spacing="1.1">VARIABLE</text>
      </g>

      <!-- QR -->
      <g transform="translate(0 312)">
        <rect x="0" y="0" width="128" height="128" rx="13" fill="#fff" filter="url(#shadow)"/>
        <g transform="translate(9 9)">
          <svg viewBox="0 0 ${qrModuleCount} ${qrModuleCount}" width="110" height="110" shape-rendering="crispEdges">
            <rect width="100%" height="100%" fill="#ffffff"/>
            <path d="${qrPath}" fill="${esc(ink)}"/>
          </svg>
        </g>
        <text x="146" y="44" font-family="${SANS}" font-weight="800" font-size="14" fill="${esc(ink)}" letter-spacing="0.6">SCANNER POUR</text>
        <text x="146" y="63" font-family="${SANS}" font-weight="800" font-size="14" fill="${esc(ink)}" letter-spacing="0.6">VÉRIFIER</text>
        <text x="146" y="84" font-family="${SANS}" font-weight="600" font-size="9" fill="${esc(inkSoft)}" letter-spacing="0.7">SÉCURISÉ • CERTIFIÉ</text>
      </g>

      <!-- Signature -->
      <g transform="translate(0 470)">
        <text x="0" y="0" font-family="${SANS}" font-weight="700" font-size="9" fill="${esc(inkSoft)}" letter-spacing="1.3">SIGNATURE DU TITULAIRE</text>
        <path d="M0 30 C 22 12, 40 44, 62 26 S 104 10, 128 32" fill="none" stroke="${esc(ink)}" stroke-width="2.2" stroke-linecap="round" opacity="0.85"/>
        <path d="M0 42 H 300" stroke="${esc(inkSoft)}" stroke-opacity="0.35" stroke-width="1"/>
        <text x="0" y="56" font-family="${SANS}" font-weight="600" font-size="9" fill="${esc(inkSoft)}" letter-spacing="0.5">${esc(truncate(`${member.firstName} ${member.lastName}`.toUpperCase(), 34))}</text>
      </g>

      <!-- Microtext security line -->
      ${microtext({ x: 0, y: 612, width: 366, text: securityLine, fill: ink, size: 3.6, opacity: 0.6 })}
    </g>

    <!-- ═══ IDENTITY ZONE ═══ -->
    <g transform="translate(36 30)">
      ${issuerEmblem}
      ${issuerWordmark}
    </g>
    ${partnerEmblem}

    <!-- Portrait window: guilloché halo, engraved frame, ID-photo rectangle -->
    ${useRosette({ href: 'rose', cx: PX + PW / 2, cy: PY + PH / 2, scale: 1.55, color: accentSoft, opacity: 0.3, strokeWidth: 0.5 })}
    <rect x="${PX - PB}" y="${PY - PB}" width="${PW + PB * 2}" height="${PH + PB * 2}" rx="20" ry="20" fill="url(#ringGrad)" filter="url(#shadow)"/>
    <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="14" ry="14" fill="${esc(darken(accent, 0.52))}"/>
    ${photoContent}
    <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="14" ry="14" fill="url(#photoScrim)"/>
    <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="14" ry="14" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2"/>
    <rect x="${PX - PB}" y="${PY - PB}" width="${PW + PB * 2}" height="${PH + PB * 2}" rx="20" ry="20" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1"/>
    ${cornerTicks(PX, PY, PW, PH, accentSoft)}

    <!-- Name + status -->
    <g transform="translate(${NAME_X} ${nameLines.length > 1 ? 218 : 246})">
      ${nameLines
        .map(
          (line, i) =>
            `<text x="0" y="${i * (nameSize + 6)}" font-family="${SANS}" font-weight="800" font-size="${nameSize}" fill="${esc(onDark)}" letter-spacing="-0.5">${esc(line)}</text>`,
        )
        .join('')}

      <g transform="translate(0 ${(nameLines.length - 1) * (nameSize + 6) + 22})">
        <rect x="0" y="0" width="164" height="31" rx="15.5" fill="${level.fill}" filter="url(#shadow)"/>
        ${medallionMark(19, 15.5, level.ring)}
        <text x="35" y="20" font-family="${SANS}" font-weight="700" font-size="11.5" fill="${level.textColor}" letter-spacing="1.2">${level.label}</text>

        <g transform="translate(176 0)">
          <rect x="0" y="0" width="146" height="31" rx="15.5" fill="${esc(accent)}" fill-opacity="0.16" stroke="${esc(accentSoft)}" stroke-opacity="0.5"/>
          <circle cx="15" cy="15.5" r="4" fill="${esc(accentSoft)}"/>
          <text x="27" y="20" font-family="${SANS}" font-weight="700" font-size="11" fill="${esc(accentSoft)}" letter-spacing="1.2">MEMBRE ACTIF</text>
        </g>

        <!-- Affiliation line — the ONE canonical place the cooperative name is
             written out. Directly under the member's name, in the reading flow
             "who / which organisation", and in the largest type it gets
             anywhere on the card. -->
        <text x="0" y="68" font-family="${SANS}" font-weight="600" font-size="12" fill="${esc(accentSoft)}" letter-spacing="1.8">COOPÉRATIVE</text>
        <text x="0" y="93" font-family="${SANS}" font-weight="700" font-size="${fitFontSize(branding.cooperativeName, NAME_MAX_W, 26, 15, true).size}" fill="${esc(onDark)}">${esc(branding.cooperativeName)}</text>
      </g>
    </g>

    <!-- Info pills — PERSONAL data only.
         The organisations live in the header (faîtière left, cooperative
         right) and in the affiliation line under the member's name; repeating
         them here made the cooperative name appear three times, and this was
         its worst rendering — truncated at 34 characters inside the smallest
         type on the card. Dropping both org pills also frees a whole row, so
         the two that remain are wider and the locality is no longer cut. -->
    <!-- Optically centred between the portrait's lower edge (${PY + PH}) and the
         issuance rule (604), not merely placed: a single row left at the old
         two-row origin sat 44px below the photo and 83px above the rule. -->
    <g transform="translate(40 490)">
      ${infoPill(0, 0, 'LOCALITÉ', member.locality || '—', accent, accentSoft, 'pin', 320)}
      ${infoPill(340, 0, 'TÉLÉPHONE', member.phone || '—', accent, accentSoft, 'phone', 320)}
    </g>

    <!-- Issuance line + microtext close the identity zone -->
    <g transform="translate(40 604)">
      <path d="M0 0 H 616" stroke="${esc(accentSoft)}" stroke-opacity="0.22" stroke-width="1"/>
      <text x="0" y="17" font-family="${SANS}" font-weight="600" font-size="9.5" fill="${esc(accentSoft)}" letter-spacing="1.1" opacity="0.85">DÉLIVRÉE PAR ${esc(truncate(branding.faitiereName.toUpperCase(), 28))} · TOGO</text>
      <text x="616" y="17" text-anchor="end" font-family="${SANS}" font-weight="600" font-size="9.5" fill="${esc(accentSoft)}" letter-spacing="1.1" opacity="0.85">DOCUMENT PROPRIÉTÉ DE L'ÉMETTEUR</text>
    </g>
    ${microtext({ x: 40, y: 636, width: 616, text: securityLine, fill: accentSoft, size: 3.6, opacity: 0.5 })}

    <!-- Bottom guilloché band closes the composition -->
    <g clip-path="url(#darkClip)">
      ${guillocheBand({ x: 0, y: 648, width: SPLIT, height: 60, lines: 11, stroke: accentSoft, strokeWidth: 0.45, opacity: 0.22 })}
    </g>

    <!-- Substrate grain over everything -->
    <rect x="0" y="0" width="${W}" height="${H}" filter="url(#grain)" opacity="0.5" fill="#808080"/>

    <!-- Card edge -->
    <rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="29" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1.5"/>
  </g>
</svg>`
}

// ─── Rasterization (SVG → Canvas → PNG) ─────────────────────────────────────

async function svgToCanvas(svgString: string): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = W * 2
  canvas.height = H * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Contexte 2D indisponible — impossible de rendre la carte')

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, W * 2, H * 2)
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
