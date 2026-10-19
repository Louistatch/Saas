/**
 * PDF de la carte de membre : une page par carte (la carte n'a qu'une face),
 * aux dimensions exactes.
 *
 *  - Sans fond perdu (défaut) : pages de 85,6 × 54 mm, la taille de la carte.
 *  - Avec fond perdu : pages de 91,6 × 60 mm (3 mm de chaque côté).
 *  - Avec repères de coupe : 5 mm de plus de chaque côté, repères tracés en
 *    vectoriel aux quatre angles, hors du fond perdu.
 *
 * Les cartes sont intégrées en PNG de 600 ppp, donc le texte et le QR sont
 * nets à l'impression.
 *
 * jsPDF est importé à la demande : il n'alourdit ni la page ni le serveur.
 */

import { BLEED, TRIM_H, TRIM_W } from './member-card'

/** PNG sous forme de data URL (navigateur) ou d'octets (serveur). */
export type PngSource = string | Uint8Array

export interface CardPdfOptions {
  /** Les PNG fournis incluent le fond perdu de 3 mm. */
  bleed?: boolean
  /** Ajoute 5 mm de marge et les repères de coupe (suppose `bleed`). */
  marks?: boolean
  title?: string
}

/** Dimensions de page en mm. */
export function cardPdfPageSize(opts: { bleed?: boolean; marks?: boolean }): {
  width: number
  height: number
} {
  const bleed = opts.bleed || opts.marks ? BLEED / 10 : 0
  const slug = opts.marks ? 5 : 0
  return {
    width: TRIM_W / 10 + (bleed + slug) * 2,
    height: TRIM_H / 10 + (bleed + slug) * 2,
  }
}

export async function buildCardPdf(
  /** Une image par carte, dans l'ordre des pages. */
  cards: ReadonlyArray<PngSource>,
  opts: CardPdfOptions = {},
): Promise<Uint8Array> {
  if (cards.length === 0) throw new Error('Aucune carte à mettre en page')
  const { jsPDF } = await import('jspdf')
  const marks = Boolean(opts.marks)
  const bleed = Boolean(opts.bleed) || marks
  const { width, height } = cardPdfPageSize({ bleed, marks })
  const art = {
    x: marks ? 5 : 0,
    y: marks ? 5 : 0,
    w: TRIM_W / 10 + (bleed ? (BLEED / 10) * 2 : 0),
    h: TRIM_H / 10 + (bleed ? (BLEED / 10) * 2 : 0),
  }

  const pdf = new jsPDF({
    unit: 'mm',
    format: [width, height],
    orientation: 'landscape',
    compress: true,
  })
  pdf.setProperties({ title: opts.title ?? 'Cartes de membre', creator: 'FaîtiereHub' })

  cards.forEach((card, i) => {
    if (i > 0) pdf.addPage([width, height], 'landscape')
    pdf.addImage(card, 'PNG', art.x, art.y, art.w, art.h, undefined, 'FAST')
    if (marks) drawCropMarks(pdf, width, height, 5 + BLEED / 10)
  })
  return new Uint8Array(pdf.output('arraybuffer'))
}

/**
 * Repères de coupe aux quatre angles du format rogné : à 0,5 mm au-delà du
 * fond perdu, sur 4 mm, trait de 0,1 mm.
 */
function drawCropMarks(
  pdf: import('jspdf').jsPDF,
  pageW: number,
  pageH: number,
  trimOffset: number,
): void {
  const gap = BLEED / 10 + 0.5
  const len = 4
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.1)
  const x0 = trimOffset
  const x1 = pageW - trimOffset
  const y0 = trimOffset
  const y1 = pageH - trimOffset
  for (const [x, dx] of [
    [x0, -1],
    [x1, 1],
  ] as const) {
    for (const [y, dy] of [
      [y0, -1],
      [y1, 1],
    ] as const) {
      pdf.line(x + dx * gap, y, x + dx * (gap + len), y)
      pdf.line(x, y + dy * gap, x, y + dy * (gap + len))
    }
  }
}
