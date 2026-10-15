/**
 * Security art primitives — the visual language of real ID documents.
 *
 * Everything here is generated mathematically as SVG paths so it rasterizes
 * identically in the browser preview, the PNG export and the print sheet.
 * No webfonts, no external assets, no blend modes that degrade on export.
 *
 * Techniques implemented:
 *  - Guilloché  : hypotrochoid line engraving (the interlaced rosette found on
 *                 banknotes and ID cards). Impossible to redraw by hand, hard
 *                 to reproduce on a photocopier — which is the point.
 *  - Microtext  : sub-millimetre repeated text. Reads as a solid hairline to
 *                 the naked eye, legible under a loupe, turns to mush when
 *                 photocopied.
 *  - Foil patch : layered iridescent gradient simulating an OVD/hologram.
 *  - Chip       : EMV-style contact plate with metallic ramp.
 */

/** Escape text for safe inclusion in SVG markup. */
export function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Hypotrochoid guilloché rosette.
 *
 * A point at distance `d` from the centre of a circle of radius `r` rolling
 * inside a circle of radius `R` traces the curve. The ratio R/r sets the
 * number of petals; stacking a few slightly-offset passes produces the
 * moiré-like interference that makes guilloché hard to counterfeit.
 */
export function guillocheRosette(opts: {
  cx: number
  cy: number
  R: number
  r: number
  d: number
  /** Number of stacked passes, each rotated slightly. */
  passes?: number
  stroke: string
  strokeWidth?: number
  opacity?: number
  /** Angular resolution in radians. Lower = smoother, heavier path. */
  step?: number
}): string {
  const { cx, cy, R, r, d, passes = 3, stroke, strokeWidth = 0.6, opacity = 0.5, step = 0.06 } = opts

  // The curve closes after r/gcd(R,r) revolutions and draws R/gcd(R,r) petals.
  // Pick R and r sharing a large common divisor: coprime values (e.g. 258/37)
  // need 37 revolutions and emit ~8k points per pass, which ballooned a single
  // card to 236 KB of SVG — 1.8 MB for one A4 sheet of eight. A divisor of 12
  // gives the same classic rosette in 3 revolutions.
  const turns = Math.round(r) / gcd(Math.round(R), Math.round(r))
  const tMax = turns * 2 * Math.PI
  const k = (R - r) / r

  const paths: string[] = []
  for (let p = 0; p < passes; p++) {
    const phase = (p * Math.PI) / (passes * 6)
    const scale = 1 - p * 0.05
    let dAttr = ''
    for (let t = 0; t <= tMax; t += step) {
      const x = cx + ((R - r) * Math.cos(t + phase) + d * Math.cos(k * t + phase)) * scale
      const y = cy + ((R - r) * Math.sin(t + phase) - d * Math.sin(k * t + phase)) * scale
      dAttr += `${dAttr ? 'L' : 'M'}${x.toFixed(0)},${y.toFixed(0)}`
    }
    paths.push(
      `<path d="${dAttr}Z" fill="none" stroke="${esc(stroke)}" stroke-width="${strokeWidth}" stroke-opacity="${opacity * (1 - p * 0.18)}"/>`,
    )
  }
  return paths.join('')
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * Emit ONE dense rosette into <defs>, normalized to radius 100 around the
 * origin, to be instanced with <use>.
 *
 * Authentic guilloché needs a high petal count (the fine interference weave);
 * generating that geometry once per card instead of once per placement is the
 * difference between a 78 KB card that looks like a flower doodle and a 40 KB
 * card that looks engraved.
 *
 * The <g> deliberately sets neither `stroke` nor `stroke-width`: both are left
 * to inherit from the <use> that instances it. `vector-effect` and
 * `currentColor` would be the idiomatic way to do this, but the server-side
 * renderer (@resvg/resvg-wasm, see fonts.ts) implements neither reliably, and
 * a card must come out identical from the browser and from /api/cards.
 * useRosette therefore pre-divides the stroke width by the scale instead.
 */
export function rosetteDef(id: string, opts?: { R?: number; r?: number; d?: number; passes?: number; step?: number }): string {
  const { R = 100, r = 14, d = 38, passes = 2, step = 0.05 } = opts ?? {}
  const turns = r / gcd(Math.round(R), Math.round(r))
  const tMax = turns * 2 * Math.PI
  const k = (R - r) / r

  const paths: string[] = []
  for (let p = 0; p < passes; p++) {
    const phase = (p * Math.PI) / (passes * 6)
    const scale = 1 - p * 0.05
    let dAttr = ''
    for (let t = 0; t <= tMax; t += step) {
      const x = ((R - r) * Math.cos(t + phase) + d * Math.cos(k * t + phase)) * scale
      const y = ((R - r) * Math.sin(t + phase) - d * Math.sin(k * t + phase)) * scale
      dAttr += `${dAttr ? 'L' : 'M'}${x.toFixed(0)},${y.toFixed(0)}`
    }
    paths.push(`<path d="${dAttr}Z" stroke-opacity="${(1 - p * 0.18).toFixed(2)}"/>`)
  }
  return `<g id="${id}" fill="none">${paths.join('')}</g>`
}

/** Instance a rosette defined by rosetteDef at a given place, scale and tint. */
export function useRosette(opts: {
  href: string
  cx: number
  cy: number
  /** 1 = the normalized radius-100 rosette. */
  scale: number
  color: string
  opacity?: number
  /** Width the hairline should have ON THE CARD, before the scale is applied. */
  strokeWidth?: number
}): string {
  const { href, cx, cy, scale, color, opacity = 0.2, strokeWidth = 0.45 } = opts
  // Pre-divide so scale × (w / scale) = w in every renderer — see rosetteDef.
  const w = (strokeWidth / scale).toFixed(3)
  return `<use href="#${href}" xlink:href="#${href}" transform="translate(${cx} ${cy}) scale(${scale})" stroke="${esc(color)}" opacity="${opacity}" stroke-width="${w}"/>`
}

/**
 * Guilloché wave band — the horizontal interlaced ribbon used along the edges
 * of secure documents. Two phase-shifted sine families weaving through
 * each other.
 */
export function guillocheBand(opts: {
  x: number
  y: number
  width: number
  height: number
  lines?: number
  stroke: string
  strokeWidth?: number
  opacity?: number
}): string {
  const { x, y, width, height, lines = 9, stroke, strokeWidth = 0.5, opacity = 0.35 } = opts
  const out: string[] = []
  for (let i = 0; i < lines; i++) {
    const phase = (i / lines) * Math.PI * 2
    const amp = height / 2 - 1
    let d = ''
    for (let px = 0; px <= width; px += 5) {
      const t = (px / width) * Math.PI * 8
      const py =
        y +
        height / 2 +
        Math.sin(t + phase) * amp * 0.62 +
        Math.sin(t * 2.33 + phase * 1.7) * amp * 0.3
      d += `${d ? 'L' : 'M'}${(x + px).toFixed(0)},${py.toFixed(1)}`
    }
    out.push(`<path d="${d}" fill="none" stroke="${esc(stroke)}" stroke-width="${strokeWidth}" stroke-opacity="${opacity}"/>`)
  }
  return out.join('')
}

/**
 * Microtext line. `size` under ~4px reads as a hairline at 1× and stays
 * legible when the card is exported at 2× or printed at 300dpi.
 */
export function microtext(opts: {
  x: number
  y: number
  width: number
  text: string
  fill: string
  size?: number
  opacity?: number
}): string {
  const { x, y, width, text, fill, size = 3.4, opacity = 0.55 } = opts
  // Roughly 0.5em advance per char for uppercase sans at small sizes.
  const perChar = size * 0.52
  const repeats = Math.ceil(width / (text.length * perChar)) + 1
  const line = Array.from({ length: repeats }, () => text).join(' · ')
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="600" letter-spacing="0.3" fill="${esc(fill)}" fill-opacity="${opacity}" textLength="${width}" lengthAdjust="spacingAndGlyphs">${esc(line)}</text>`
}

/** EMV-style contact chip with a metallic ramp and contact traces. */
export function chip(x: number, y: number, w = 52, h = 40): string {
  const r = 6
  return `<g transform="translate(${x} ${y})">
    <rect width="${w}" height="${h}" rx="${r}" fill="url(#chipGrad)"/>
    <rect width="${w}" height="${h}" rx="${r}" fill="none" stroke="#8a6a20" stroke-opacity="0.55" stroke-width="0.8"/>
    <g stroke="#8a6a20" stroke-opacity="0.5" stroke-width="1.1" fill="none">
      <path d="M0 ${h * 0.34}H${w * 0.3}M${w * 0.7} ${h * 0.34}H${w}"/>
      <path d="M0 ${h * 0.66}H${w * 0.3}M${w * 0.7} ${h * 0.66}H${w}"/>
      <path d="M${w * 0.3} ${h * 0.16}V${h * 0.84}M${w * 0.7} ${h * 0.16}V${h * 0.84}"/>
      <rect x="${w * 0.3}" y="${h * 0.34}" width="${w * 0.4}" height="${h * 0.32}"/>
    </g>
    <rect width="${w}" height="${h * 0.45}" rx="${r}" fill="#ffffff" fill-opacity="0.22"/>
  </g>`
}

/**
 * Iridescent foil patch (OVD simulation). Built from stacked rotated linear
 * gradients rather than mix-blend-mode, so the export matches the preview.
 */
export function foilPatch(x: number, y: number, w: number, h: number, id: string): string {
  return `<g transform="translate(${x} ${y})" clip-path="url(#${id}Clip)">
    <rect width="${w}" height="${h}" rx="8" fill="url(#foilA)"/>
    <rect width="${w}" height="${h}" rx="8" fill="url(#foilB)" opacity="0.55"/>
    ${guillocheRosette({
      cx: w / 2,
      cy: h / 2,
      R: 27,
      r: 9,
      d: 11,
      passes: 2,
      stroke: '#ffffff',
      strokeWidth: 0.45,
      opacity: 0.5,
      step: 0.07,
    })}
    <rect width="${w}" height="${h}" rx="8" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="0.8"/>
  </g>`
}

/**
 * Organisation emblem — a rounded square plate carrying an uploaded logo.
 *
 * Deliberately NOT a circle: a circle crops the corners off most cooperative
 * logos (wordmarks, shields, anything wider than tall), and the rounded square
 * echoes the portrait window so the two framed elements read as one system.
 *
 * The logo sits on a light plate and is fitted with `meet`, never `slice` — an
 * organisation's emblem may be letterboxed, never cropped. The plate also keeps
 * dark logos and transparent PNGs legible on a dark green card, which is what a
 * bare <image> would fail at.
 *
 * `id` must be unique per call: it names the clip path.
 */
export function emblem(opts: {
  x: number
  y: number
  size: number
  href: string
  id: string
  /** Plate tint behind the logo. */
  plate?: string
}): string {
  const { x, y, size, href, id, plate = '#ffffff' } = opts
  const r = Math.round(size * 0.26)
  const pad = Math.round(size * 0.12)
  const inner = size - pad * 2
  return `<g transform="translate(${x} ${y})">
    <clipPath id="${id}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}"/></clipPath>
    <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${esc(plate)}" fill-opacity="0.94" filter="url(#shadow)"/>
    <g clip-path="url(#${id})">
      <image href="${esc(href)}" xlink:href="${esc(href)}" x="${pad}" y="${pad}" width="${inner}" height="${inner}" preserveAspectRatio="xMidYMid meet"/>
    </g>
    <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="1"/>
  </g>`
}

// ─── Text metrics ────────────────────────────────────────────────────────────

/**
 * Estimate rendered text width WITHOUT a DOM.
 *
 * This exists because the previous renderer truncated by character count,
 * which let long names overflow into the right-hand panel: 21 characters of
 * "Issodo Louis TATCHIDA" passed a 22-char limit but painted ~640px at
 * font-size 42 and ran off the dark zone.
 *
 * Per-character advance ratios for a bold grotesque (Arial/Helvetica metrics,
 * which is what actually renders — webfonts never load inside an SVG
 * rasterized through an <img> element).
 */
export function estimateTextWidth(text: string, fontSize: number, bold = false): number {
  let units = 0
  for (const ch of text) {
    if (ch === ' ') units += 0.28
    else if (/[iIlj|.,;:'`!]/.test(ch)) units += 0.28
    else if (/[frt()[\]{}/\\-]/.test(ch)) units += 0.36
    else if (/[A-ZÀ-ÖØ-Þ]/.test(ch)) units += 0.68
    else if (/[mwMW]/.test(ch)) units += 0.86
    else if (/[0-9]/.test(ch)) units += 0.56
    else units += 0.54
  }
  return units * fontSize * (bold ? 1.04 : 1)
}

/**
 * Shrink a font size until the text fits `maxWidth`, never going below `min`.
 * Returns the size actually used plus whether it still overflows (so callers
 * can decide to wrap instead of clipping).
 */
export function fitFontSize(
  text: string,
  maxWidth: number,
  preferred: number,
  min: number,
  bold = false,
): { size: number; fits: boolean } {
  let size = preferred
  while (size > min && estimateTextWidth(text, size, bold) > maxWidth) {
    size -= 1
  }
  return { size, fits: estimateTextWidth(text, size, bold) <= maxWidth }
}

/** Split a name onto at most two lines, breaking on the last space that fits. */
export function wrapToTwoLines(text: string, maxWidth: number, fontSize: number, bold = false): string[] {
  if (estimateTextWidth(text, fontSize, bold) <= maxWidth) return [text]
  const words = text.split(' ')
  if (words.length < 2) return [text]

  let best: [string, string] | null = null
  for (let i = words.length - 1; i > 0; i--) {
    const a = words.slice(0, i).join(' ')
    const b = words.slice(i).join(' ')
    if (estimateTextWidth(a, fontSize, bold) <= maxWidth && estimateTextWidth(b, fontSize, bold) <= maxWidth) {
      best = [a, b]
      break
    }
  }
  return best ?? [words.slice(0, -1).join(' '), words[words.length - 1]]
}
