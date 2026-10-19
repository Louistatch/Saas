/**
 * Mise en page d'une feuille A4 de cartes de membre, en millimètres.
 *
 * Chaque carte occupe exactement 85,6 × 54 mm (CR80), au millimètre près, plus
 * 3 mm de fond perdu ; les cartes sont séparées par une gouttière de 12 mm où
 * logent les repères de coupe. Huit cartes par feuille (2 colonnes × 4 lignes),
 * imprimées d'un seul côté de la feuille : la carte n'a qu'une face.
 */

export const SHEET = {
  pageWidth: 210,
  pageHeight: 297,
  trimWidth: 85.6,
  trimHeight: 54,
  bleed: 3,
  gutter: 12,
  columns: 2,
  rows: 4,
} as const

export const CARDS_PER_SHEET = SHEET.columns * SHEET.rows

const gridWidth = SHEET.columns * SHEET.trimWidth + (SHEET.columns - 1) * SHEET.gutter
const gridHeight = SHEET.rows * SHEET.trimHeight + (SHEET.rows - 1) * SHEET.gutter
const originX = (SHEET.pageWidth - gridWidth) / 2
const originY = (SHEET.pageHeight - gridHeight) / 2

/** Coin haut-gauche du format rogné de la carte `index` (0..7) d'une feuille. */
export function cellTrimOrigin(index: number): { x: number; y: number } {
  const column = index % SHEET.columns
  const row = Math.floor(index / SHEET.columns)
  return {
    x: originX + column * (SHEET.trimWidth + SHEET.gutter),
    y: originY + row * (SHEET.trimHeight + SHEET.gutter),
  }
}

/**
 * Repères de coupe d'une carte : huit traits de 4 mm, à 0,5 mm au-delà du fond
 * perdu, alignés sur les bords du format rogné. Chemin SVG en millimètres.
 */
export function cropMarksPath(origin: { x: number; y: number }): string {
  const gap = SHEET.bleed + 0.5
  const len = 4
  const x0 = origin.x
  const x1 = origin.x + SHEET.trimWidth
  const y0 = origin.y
  const y1 = origin.y + SHEET.trimHeight
  let d = ''
  for (const x of [x0, x1]) {
    const dx = x === x0 ? -1 : 1
    for (const y of [y0, y1]) {
      const dy = y === y0 ? -1 : 1
      d += `M${(x + dx * gap).toFixed(2)} ${y.toFixed(2)}H${(x + dx * (gap + len)).toFixed(2)}`
      d += `M${x.toFixed(2)} ${(y + dy * gap).toFixed(2)}V${(y + dy * (gap + len)).toFixed(2)}`
    }
  }
  return d
}
