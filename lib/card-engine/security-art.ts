/**
 * Éléments graphiques de la carte de membre : pictogrammes, feuillage en
 * filigrane, emblème vectoriel de repli.
 *
 * Tout est généré en SVG, sans police ni image externe, de sorte que l'aperçu,
 * l'export PNG, le PDF et la feuille imprimée sont le même dessin. Les
 * pictogrammes sont dessinés sur une grille de 24 unités centrée sur l'origine,
 * puis placés et mis à l'échelle par `icon()`.
 *
 * Aucun faux élément de sécurité (puce, hologramme, signature inventée) : seul
 * le contrôle en ligne, via le QR, fait foi.
 */

/** Échappe un texte pour l'insérer dans un SVG. */
export function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Empreinte stable 32 bits (FNV-1a) : suffixe des identifiants internes du SVG. */
export function hashString(input: string): number {
  let h = 2166136261
  for (const ch of input) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const f1 = (n: number): string => n.toFixed(1)

export type IconName =
  | 'pin'
  | 'phone'
  | 'building'
  | 'people'
  | 'calendar'
  | 'shield-check'
  | 'shield-alert'
  | 'shield-cross'
  | 'medal'

/** Pictogrammes pleins, grille 24 × 24 centrée. */
const GLYPHS: Record<IconName, (c: string) => string> = {
  pin: (c) =>
    `<path fill-rule="evenodd" fill="${c}" d="M0 -10C-4.6 -10 -7.8 -6.7 -7.8 -2.5C-7.8 3.3 0 10.5 0 10.5S7.8 3.3 7.8 -2.5C7.8 -6.7 4.6 -10 0 -10ZM2.9 -2.7A2.9 2.9 0 1 0 -2.9 -2.7A2.9 2.9 0 1 0 2.9 -2.7Z"/>`,
  phone: (c) =>
    `<path fill="${c}" d="M-7.6 -9.4L-3.9 -10.2L-1.6 -4.9L-4 -2.9C-2.6 0.3 -0.2 2.7 3 4.1L5 1.7L10.2 4L9.4 7.6C9.1 8.9 7.9 9.8 6.6 9.6C-1.6 8.3 -8.3 1.6 -9.6 -6.6C-9.8 -7.9 -8.9 -9.1 -7.6 -9.4Z"/>`,
  building: (c) =>
    `<g fill="${c}"><path d="M-10 -4.2L0 -10L10 -4.2V-2.6H-10Z"/><rect x="-10" y="7.4" width="20" height="2.6" rx="0.6"/><rect x="-8" y="-1.4" width="2.6" height="7.8"/><rect x="-3.6" y="-1.4" width="2.6" height="7.8"/><rect x="1" y="-1.4" width="2.6" height="7.8"/><rect x="5.4" y="-1.4" width="2.6" height="7.8"/></g>`,
  people: (c) =>
    `<g fill="${c}"><circle cx="0" cy="-4.6" r="3.4"/><path d="M-6 8C-6 2.4 -3.4 0 0 0S6 2.4 6 8Z"/><circle cx="-7.2" cy="-2.6" r="2.6"/><path d="M-11.4 7.4C-11.4 3.4 -9.6 1.4 -7.2 1.4C-6.2 1.4 -5.4 1.7 -4.7 2.3C-5.9 3.7 -6.7 5.4 -6.9 7.4Z"/><circle cx="7.2" cy="-2.6" r="2.6"/><path d="M11.4 7.4C11.4 3.4 9.6 1.4 7.2 1.4C6.2 1.4 5.4 1.7 4.7 2.3C5.9 3.7 6.7 5.4 6.9 7.4Z"/></g>`,
  calendar: (c) =>
    `<g fill="${c}"><path fill-rule="evenodd" d="M-8.6 -6.6H8.6A1.6 1.6 0 0 1 10.2 -5V8.4A1.6 1.6 0 0 1 8.6 10H-8.6A1.6 1.6 0 0 1 -10.2 8.4V-5A1.6 1.6 0 0 1 -8.6 -6.6ZM-8.2 -2.2V8H8.2V-2.2Z"/><rect x="-6" y="-10" width="2.4" height="5.4" rx="1.2"/><rect x="3.6" y="-10" width="2.4" height="5.4" rx="1.2"/><rect x="-6" y="0.4" width="3" height="2.6"/><rect x="-1.5" y="0.4" width="3" height="2.6"/><rect x="3" y="0.4" width="3" height="2.6"/><rect x="-6" y="4.4" width="3" height="2.6"/><rect x="-1.5" y="4.4" width="3" height="2.6"/></g>`,
  'shield-check': (c) => shield(c, 'M-4 0.2L-1.1 3.1L4.4 -2.6'),
  'shield-alert': (c) => shield(c, 'M0 -4.4V1M0 4.2V4.3'),
  'shield-cross': (c) => shield(c, 'M-3.4 -3.2L3.4 3.6M3.4 -3.2L-3.4 3.6'),
  medal: (c) =>
    `<g fill="${c}"><path d="M-6.4 -10.4H-2L1.2 -3.6H-3.2Z"/><path d="M6.4 -10.4H2L-1.2 -3.6H3.2Z"/><path fill-rule="evenodd" d="M7.4 3.6A7.4 7.4 0 1 0 -7.4 3.6A7.4 7.4 0 1 0 7.4 3.6ZM4.6 3.6A4.6 4.6 0 1 0 -4.6 3.6A4.6 4.6 0 1 0 4.6 3.6Z"/></g>`,
}

/** Écusson plein, marque intérieure évidée (trait de la couleur `hole`). */
function shield(c: string, mark: string): string {
  return `<path fill="${c}" d="M0 -10.6L8.6 -7.2V-1.4C8.6 4.4 4.9 8.7 0 10.6C-4.9 8.7 -8.6 4.4 -8.6 -1.4V-7.2Z"/><path d="${mark}" fill="none" stroke="var(--hole)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
}

/**
 * Pictogramme `name`, centré en (cx, cy), de côté `size` (unités de carte).
 * `hole` : couleur de la marque intérieure des écussons (coche, croix, « ! »).
 */
export function icon(
  name: IconName,
  cx: number,
  cy: number,
  size: number,
  color: string,
  hole = '#FFFFFF',
): string {
  const k = size / 24
  const body = GLYPHS[name](esc(color)).replace(/var\(--hole\)/g, esc(hole))
  return `<g transform="translate(${f1(cx)} ${f1(cy)}) scale(${k.toFixed(3)})">${body}</g>`
}

/**
 * Feuille stylisée, pointée vers +x, longueur 100 avant mise à l'échelle :
 * limbe plein et nervures. Sert au filigrane du fond.
 */
const LEAF_BLADE = 'M0 0C16 -22 52 -33 100 -4C60 26 20 24 0 0Z'
const LEAF_VEINS =
  'M0 0C30 -6 64 -8 100 -4M28 -4L40 -20M48 -6L62 -22M68 -6L80 -16M30 -4L40 10M50 -5L62 9M70 -5L80 3'

export interface LeafSpec {
  x: number
  y: number
  /** Angle en degrés. */
  angle: number
  /** Longueur en unités de carte. */
  length: number
  opacity: number
}

/** Bouquet de feuilles en filigrane (aplat très léger, nervures plus marquées). */
export function leafWatermark(leaves: ReadonlyArray<LeafSpec>, fill: string, vein: string): string {
  return leaves
    .map((l) => {
      const k = l.length / 100
      return `<g transform="translate(${f1(l.x)} ${f1(l.y)}) rotate(${f1(l.angle)}) scale(${k.toFixed(3)})" opacity="${l.opacity}"><path d="${LEAF_BLADE}" fill="${esc(fill)}"/><path d="${LEAF_VEINS}" fill="none" stroke="${esc(vein)}" stroke-width="${f1(1.4 / k)}" stroke-linecap="round"/></g>`
    })
    .join('')
}

/**
 * Emblème FaîtiereHub vectoriel, utilisé quand le logo officiel
 * (public/logo.png) n'est pas fourni : disque, champs en courbes, trois
 * silhouettes. Rayon `r`, centré en (cx, cy).
 */
export function emblemVector(
  cx: number,
  cy: number,
  r: number,
  green: string,
  light: string,
): string {
  const k = r / 24
  return `<g transform="translate(${f1(cx)} ${f1(cy)}) scale(${k.toFixed(3)})"><circle r="24" fill="#FFFFFF"/><circle r="21" fill="none" stroke="${esc(green)}" stroke-width="2.4"/><path d="M-17 9C-8 2 6 1 17 6L15 11C5 6 -6 7 -14 13Z" fill="${esc(green)}"/><path d="M-12 16C-4 10 8 9 15 12L12 16C6 14 -3 15 -8 18Z" fill="${esc(light)}"/><circle cx="0" cy="-7" r="4.2" fill="${esc(green)}"/><path d="M-6.5 4C-6.5 -1 -3.5 -3 0 -3S6.5 -1 6.5 4Z" fill="${esc(green)}"/><circle cx="-8.5" cy="-4" r="3" fill="${esc(light)}"/><circle cx="8.5" cy="-4" r="3" fill="${esc(light)}"/><path d="M-13 -11C-15 -5 -14 0 -11 3C-10 -2 -10.5 -7 -13 -11Z" fill="${esc(light)}"/></g>`
}
