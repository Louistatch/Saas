/**
 * Jetons de couleur de la carte de membre.
 *
 * Direction : la carte vitrine (public/showcase-card.png). Fond vert profond,
 * bandeau clair, accents verts lumineux. Ces verts sont FIXES : ils portent le
 * texte et leur contraste est garanti une fois pour toutes (WCAG AA au moins,
 * voir tests/member-card.test.ts).
 *
 * La couleur de l'organisation n'est qu'un accent secondaire : anneau et halo
 * de la photo, silhouette du portrait vide. Elle ne porte jamais de texte. Une couleur claire (jaune, néon) garde sa teinte et reçoit un
 * pictogramme foncé ; une couleur sombre reçoit un pictogramme blanc.
 *
 * Fonctions pures, sans DOM ni dépendance : testables seules.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Hsl {
  /** 0..360 */
  h: number
  /** 0..1 */
  s: number
  /** 0..1 */
  l: number
}

export function parseHex(input: string | null | undefined): Rgb | null {
  if (!input) return null
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim())
  if (!m) return null
  const raw = m[1]
  const full = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  }
}

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)))

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((v) => clamp255(v).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s, l }
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

/** Luminance relative WCAG 2.x, 0..1. */
export function relativeLuminance(color: string | Rgb): number {
  const rgb = typeof color === 'string' ? parseHex(color) : color
  if (!rgb) return 0
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}

/** Rapport de contraste WCAG 2.x entre deux couleurs, de 1 à 21. */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/** Mélange `top` sur `base` avec l'opacité `alpha` (aplat équivalent). */
export function blend(base: string, top: string, alpha: number): string {
  const a = parseHex(base) ?? { r: 0, g: 0, b: 0 }
  const b = parseHex(top) ?? { r: 0, g: 0, b: 0 }
  return toHex({
    r: a.r + (b.r - a.r) * alpha,
    g: a.g + (b.g - a.g) * alpha,
    b: a.b + (b.b - a.b) * alpha,
  })
}

export type Tone = 'ok' | 'warn' | 'danger'

export interface ToneColors {
  /** Badge du bandeau clair : fond, filet, texte. */
  badgeFill: string
  badgeStroke: string
  badgeText: string
  /** Sur le fond sombre : texte de la pastille et du mot de statut. */
  onDark: string
  /** Point et jauge du pied. */
  dot: string
  barFrom: string
  barTo: string
}

export interface CardTokens {
  /** Fond : centre lumineux (derrière la photo), milieu, bords. */
  bgGlow: string
  bgMid: string
  bgDeep: string
  /** Bandeau clair. */
  bandTop: string
  bandBottom: string
  bandInk: string
  bandMuted: string
  bandHub: string
  bandRule: string
  /** Texte sur fond sombre : valeurs (blanc) et libellés (vert atténué, AA). */
  text: string
  label: string
  /** Vitrage des tuiles : blanc posé à cette opacité. */
  glassAlpha: number
  /** Verts vitrine (filets, vagues, feuillage). */
  green: string
  greenLight: string
  greenDark: string
  /** Accent de l'organisation (anneau, pastilles d'icônes) et son pictogramme. */
  accent: string
  accentLight: string
  accentDark: string
  onAccent: string
  /** Fenêtre du QR. */
  panel: string
  panelInk: string
  panelMuted: string
  qr: string
  tones: Record<Tone, ToneColors>
}

/** Verts de la carte vitrine. */
const SHOWCASE_GREEN = '#2FA35A'
const WHITE = '#FFFFFF'
const INK_ON_ACCENT_DARK = '#0B2716'
/** Contraste minimal d'un pictogramme sur sa pastille (élément graphique, WCAG 1.4.11). */
export const ICON_ON_ACCENT_MIN = 3

const TONES: Record<Tone, ToneColors> = {
  ok: {
    badgeFill: '#E3F4E8',
    badgeStroke: '#A8D9B8',
    badgeText: '#17663A',
    onDark: '#9BEDBB',
    dot: '#4ADE80',
    barFrom: '#2FA35A',
    barTo: '#9BEDBB',
  },
  warn: {
    badgeFill: '#FFF1D6',
    badgeStroke: '#E9BE68',
    badgeText: '#8A4A00',
    onDark: '#FFD48A',
    dot: '#F5B83D',
    barFrom: '#C98A12',
    barTo: '#FFD48A',
  },
  danger: {
    badgeFill: '#FDE7E5',
    badgeStroke: '#EFA39B',
    badgeText: '#A52019',
    onDark: '#FFB3AB',
    dot: '#F06A5E',
    barFrom: '#C0392B',
    barTo: '#FFB3AB',
  },
}

/**
 * Accent de l'organisation : sa teinte, ramenée à une saturation et une
 * clarté qui se voient sur le vert profond (un vert sombre de marque
 * deviendrait sinon invisible sur le fond).
 */
function accentFrom(input: string | null | undefined): Hsl {
  const rgb = parseHex(input) ?? (parseHex(SHOWCASE_GREEN) as Rgb)
  const hsl = rgbToHsl(rgb)
  const s = hsl.s < 0.08 ? hsl.s : Math.min(0.85, Math.max(0.5, hsl.s))
  return { h: hsl.h, s, l: 0.42 }
}

export function deriveCardTokens(input: {
  /** Couleur principale de l'organisation (ou fond du modèle enregistré). */
  brand?: string | null
  /** Couleur d'accent du modèle, à défaut de couleur principale. */
  accent?: string | null
}): CardTokens {
  const source = parseHex(input.brand) ? input.brand : parseHex(input.accent) ? input.accent : null
  const base = accentFrom(source)
  const accent = toHex(hslToRgb(base))
  const accentLight = toHex(hslToRgb({ ...base, l: 0.64 }))
  const accentDark = toHex(hslToRgb({ ...base, l: 0.24 }))
  const onAccent = contrastRatio(WHITE, accent) >= ICON_ON_ACCENT_MIN ? WHITE : INK_ON_ACCENT_DARK

  return {
    bgGlow: '#12603A',
    bgMid: '#0B4628',
    bgDeep: '#052A17',
    bandTop: '#F7FAF6',
    bandBottom: '#E6F0E7',
    bandInk: '#10291A',
    bandMuted: '#3E5E49',
    bandHub: '#1E7A3E',
    bandRule: '#C5D3C8',
    text: WHITE,
    label: '#B5DCC2',
    glassAlpha: 0.06,
    green: SHOWCASE_GREEN,
    greenLight: '#8EE6AE',
    greenDark: '#1E7A3E',
    accent,
    accentLight,
    accentDark,
    onAccent,
    panel: WHITE,
    panelInk: '#1F3A2B',
    panelMuted: '#3E5E49',
    qr: '#000000',
    tones: TONES,
  }
}
