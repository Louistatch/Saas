/**
 * Mesure et mise en page du texte des cartes, sans DOM.
 *
 * La carte de membre est composée en Poppins (400, 500, 600, 700). Poppins n'a
 * ni les lettres éwé et kabiyè (Ɖ Ɛ Ɔ Ŋ Ʋ Ƒ Ɣ, ɖ ɛ ɔ ŋ ʋ ƒ ɣ) ni les tons
 * combinants : chaque grappe (lettre + diacritiques) qu'elle ne sait pas
 * dessiner est composée en Liberation Sans — explicitement, par un <tspan>
 * (voir `fontRuns`), pour que resvg et les navigateurs choisissent la même
 * police et la même graisse (400 jusqu'à 500, 700 au-delà). La mesure suit la
 * même règle, avec les tables d'avances des deux polices (glyph-metrics.ts).
 *
 * Les tailles sont en unités de la carte (1 unité = 0,1 mm). La conversion en
 * points typographiques est `PT` unités par point.
 */

import {
  type AdvanceRanges,
  LIBERATION_ADVANCES,
  LIBERATION_UNITS_PER_EM,
  POPPINS_ADVANCES,
  POPPINS_UNITS_PER_EM,
} from './glyph-metrics'

/** Unités de la carte (0,1 mm) par point typographique : 25,4 mm / 72 pt × 10. */
export const PT = 254 / 72

export type FontWeight = 400 | 500 | 600 | 700

type AdvanceTable = Map<number, number>

function buildTable(ranges: AdvanceRanges): AdvanceTable {
  const table: AdvanceTable = new Map()
  for (const [start, run] of ranges) {
    run.forEach((value, i) => {
      if (value !== 0) table.set(start + i, value)
    })
  }
  return table
}

const PRIMARY: Record<FontWeight, AdvanceTable> = {
  400: buildTable(POPPINS_ADVANCES[400]),
  500: buildTable(POPPINS_ADVANCES[500]),
  600: buildTable(POPPINS_ADVANCES[600]),
  700: buildTable(POPPINS_ADVANCES[700]),
}
const FALLBACK: Record<400 | 700, AdvanceTable> = {
  400: buildTable(LIBERATION_ADVANCES[400]),
  700: buildTable(LIBERATION_ADVANCES[700]),
}

/** Graisse de Liberation Sans utilisée en repli : 400 jusqu'à 500, 700 au-delà. */
export function fallbackWeight(weight: FontWeight): 400 | 700 {
  return weight >= 600 ? 700 : 400
}

/** Largeur d'un glyphe absent des deux polices, en em (repli prudent). */
const MISSING_EM = 0.6

const isMark = (cp: number): boolean =>
  (cp >= 0x300 && cp <= 0x36f) ||
  (cp >= 0x1ab0 && cp <= 0x1aff) ||
  (cp >= 0x1dc0 && cp <= 0x1dff) ||
  (cp >= 0x20d0 && cp <= 0x20ff) ||
  (cp >= 0xfe20 && cp <= 0xfe2f)

/** Le point de code est-il dessiné par Poppins à cette graisse ? */
export function inPrimaryFont(codePoint: number, weight: FontWeight = 400): boolean {
  return PRIMARY[weight].has(codePoint)
}

/**
 * Grappes : une lettre et ses diacritiques combinants. Une grappe dont un
 * point de code manque à Poppins part entière en repli (le ton reste posé sur
 * sa lettre, dessinés par la même police).
 */
function clusters(text: string): string[] {
  const out: string[] = []
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (isMark(cp) && out.length) out[out.length - 1] += ch
    else out.push(ch)
  }
  return out
}

function clusterIsPrimary(cluster: string, weight: FontWeight): boolean {
  for (const ch of cluster) {
    if (!PRIMARY[weight].has(ch.codePointAt(0) ?? 0)) return false
  }
  return true
}

export interface FontRun {
  text: string
  /** Vrai : à composer en Liberation Sans (graisse `fallbackWeight`). */
  fallback: boolean
}

/** Découpe un texte en suites Poppins / Liberation Sans, grappe par grappe. */
export function fontRuns(text: string, weight: FontWeight = 400): FontRun[] {
  const runs: FontRun[] = []
  for (const cluster of clusters(text)) {
    const fallback = !clusterIsPrimary(cluster, weight)
    const last = runs[runs.length - 1]
    if (last && last.fallback === fallback) last.text += cluster
    else runs.push({ text: cluster, fallback })
  }
  return runs
}

function fallbackAdvanceEm(cp: number, weight: FontWeight): number {
  const v = FALLBACK[fallbackWeight(weight)].get(cp)
  if (v === undefined) return MISSING_EM
  if (v < 0) return 0
  return v / LIBERATION_UNITS_PER_EM
}

/**
 * Avance d'un point de code isolé, en em : Poppins s'il le dessine, sinon
 * Liberation Sans à la graisse de repli. Diacritique combinant : 0.
 */
export function advanceEm(codePoint: number, weight: FontWeight = 400): number {
  if (isMark(codePoint)) return 0
  const v = PRIMARY[weight].get(codePoint)
  if (v !== undefined) return v / POPPINS_UNITS_PER_EM
  return fallbackAdvanceEm(codePoint, weight)
}

export interface TextStyle {
  weight?: FontWeight
  /** Crénage ajouté après chaque grappe, en unités (letter-spacing). */
  tracking?: number
}

/** Largeur d'un texte, en unités de carte. */
export function measureText(text: string, size: number, style: TextStyle = {}): number {
  const { weight = 400, tracking = 0 } = style
  let em = 0
  let visible = 0
  for (const cluster of clusters(text)) {
    const primary = clusterIsPrimary(cluster, weight)
    let w = 0
    for (const ch of cluster) {
      const cp = ch.codePointAt(0) ?? 0
      if (isMark(cp)) continue
      w += primary
        ? (PRIMARY[weight].get(cp) ?? 0) / POPPINS_UNITS_PER_EM
        : fallbackAdvanceEm(cp, weight)
    }
    em += w
    if (w > 0) visible++
  }
  return em * size + visible * tracking
}

/**
 * Coupe un texte en lignes qui tiennent dans `maxWidth`, aux espaces et après
 * les traits d'union (jamais au milieu d'un mot). Minimise le déséquilibre
 * entre lignes plutôt que de remplir la première. `null` si un seul mot est
 * plus large que la ligne ou si `maxLines` ne suffit pas.
 */
export function breakLines(
  text: string,
  maxWidth: number,
  size: number,
  style: TextStyle,
  maxLines: number,
): string[] | null {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return ['']
  const m = (s: string) => measureText(s, size, style)
  if (m(clean) <= maxWidth) return [clean]
  if (maxLines < 2) return null

  // Jetons : un mot est découpé après chaque trait d'union ; `joinSpace` dit si
  // une espace sépare ce jeton du suivant.
  const tokens: { text: string; joinSpace: boolean }[] = []
  for (const word of clean.split(' ')) {
    const parts = word.match(/[^-]+-?|-/g) ?? [word]
    parts.forEach((part, i) => {
      tokens.push({ text: part, joinSpace: i === parts.length - 1 })
    })
  }
  const n = tokens.length
  const slice = (i: number, j: number): string => {
    let out = ''
    for (let k = i; k < j; k++) {
      out += tokens[k].text
      if (k < j - 1 && tokens[k].joinSpace) out += ' '
    }
    return out
  }
  if (tokens.some((t) => m(t.text) > maxWidth)) return null

  // Programmation dynamique : best[l][j] = coût minimal pour couvrir les j
  // premiers jetons en l lignes (coût = somme des carrés du blanc restant,
  // dernière ligne exclue).
  const INF = Number.POSITIVE_INFINITY
  const best: number[][] = Array.from({ length: maxLines + 1 }, () => new Array(n + 1).fill(INF))
  const from: number[][] = Array.from({ length: maxLines + 1 }, () => new Array(n + 1).fill(0))
  best[0][0] = 0
  for (let l = 1; l <= maxLines; l++) {
    for (let j = 1; j <= n; j++) {
      for (let i = l - 1; i < j; i++) {
        if (best[l - 1][i] === INF) continue
        const w = m(slice(i, j))
        if (w > maxWidth) continue
        const slack = j === n ? 0 : (maxWidth - w) ** 2
        const cost = best[l - 1][i] + slack
        if (cost < best[l][j]) {
          best[l][j] = cost
          from[l][j] = i
        }
      }
    }
  }
  let lines = 0
  for (let l = 1; l <= maxLines; l++) {
    if (best[l][n] < INF && (lines === 0 || best[l][n] < best[lines][n])) lines = l
  }
  if (lines === 0) return null
  const out: string[] = []
  let j = n
  for (let l = lines; l >= 1; l--) {
    const i = from[l][j]
    out.unshift(slice(i, j))
    j = i
  }
  return out
}

export interface FitOptions extends TextStyle {
  maxWidth: number
  /** Taille préférée et plancher, en points. */
  prefPt: number
  minPt: number
  maxLines?: number
  /** Pas de réduction, en points. */
  stepPt?: number
}

export interface FitResult {
  lines: string[]
  /** Taille retenue, en points. */
  pt: number
  /** Compression horizontale de dernier recours (1 = aucune). */
  scaleX: number
  /** Vrai si la dernière ligne a été tronquée par une ellipse. */
  ellipsized: boolean
}

/** Mots-outils qu'une coupure ne laisse jamais en fin de ligne abrégée. */
const FUNCTION_WORDS = new Set([
  'de',
  'du',
  'des',
  'd’',
  "d'",
  'la',
  'le',
  'les',
  'l’',
  "l'",
  'et',
  'à',
  'au',
  'aux',
  'en',
  'pour',
  'sur',
])

/** Coupe `text` à un mot entier et ajoute « … » pour tenir dans `maxWidth`. */
export function ellipsize(text: string, maxWidth: number, size: number, style: TextStyle): string {
  if (measureText(text, size, style) <= maxWidth) return text
  const words = text.split(' ')
  while (words.length > 1) {
    words.pop()
    // Jamais « … » après un mot-outil (« de la Préfecture du… ») ni une virgule.
    while (
      words.length > 1 &&
      FUNCTION_WORDS.has(words[words.length - 1].toLocaleLowerCase('fr'))
    ) {
      words.pop()
    }
    const candidate = `${words.join(' ').replace(/[,;:\s–-]+$/, '')}…`
    if (measureText(candidate, size, style) <= maxWidth) return candidate
  }
  // Un seul mot : on rogne les caractères.
  let s = text
  while (s.length > 1 && measureText(`${s}…`, size, style) > maxWidth) s = s.slice(0, -1)
  return `${s}…`
}

/**
 * Échelle d'ajustement d'un texte dans une boîte :
 *  1. rétrécir sur une ligne jusqu'au plancher ;
 *  2. passer à 2 lignes (puis `maxLines`), en réessayant de la taille préférée
 *     au plancher ;
 *  3. en dernier recours, compresser horizontalement (jamais sous 0,7), et
 *     seulement si `allowEllipsis`, tronquer à un mot entier.
 * Un nom de personne n'est jamais tronqué : `allowEllipsis: false`.
 */
export function fitText(text: string, opts: FitOptions & { allowEllipsis?: boolean }): FitResult {
  const { maxWidth, prefPt, minPt, maxLines = 2, stepPt = 0.25, allowEllipsis = false } = opts
  const style: TextStyle = { weight: opts.weight, tracking: opts.tracking }
  const clean = text.replace(/\s+/g, ' ').trim()
  for (let lines = 1; lines <= maxLines; lines++) {
    for (let pt = prefPt; pt >= minPt - 1e-9; pt -= stepPt) {
      const broken = breakLines(clean, maxWidth, pt * PT, style, lines)
      if (broken) return { lines: broken, pt, scaleX: 1, ellipsized: false }
    }
  }
  // Dernier recours : plancher, lignes maximales, compression horizontale.
  const size = minPt * PT
  const naturalLines = greedyLines(clean, maxWidth, size, style, maxLines)
  const widest = Math.max(...naturalLines.map((l) => measureText(l, size, style)))
  const scaleX = widest > maxWidth ? Math.max(0.7, maxWidth / widest) : 1
  if (allowEllipsis && widest * scaleX > maxWidth + 0.5) {
    const last = naturalLines.length - 1
    const trimmed = naturalLines.map((l, i) =>
      i === last ? ellipsize(l, maxWidth / scaleX, size, style) : l,
    )
    return { lines: trimmed, pt: minPt, scaleX, ellipsized: true }
  }
  return {
    lines: naturalLines.length ? naturalLines : [clean],
    pt: minPt,
    scaleX,
    ellipsized: false,
  }
}

/** Remplissage glouton, utilisé seulement pour le dernier recours. */
function greedyLines(
  text: string,
  maxWidth: number,
  size: number,
  style: TextStyle,
  maxLines: number,
): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (!current || measureText(candidate, size, style) <= maxWidth) current = candidate
    else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1)
    return [...head, lines.slice(maxLines - 1).join(' ')]
  }
  return lines
}
