/**
 * Carte de membre FaîtiereHub — une seule face, format CR80 (85,6 × 54 mm).
 *
 * Direction : la carte vitrine (public/showcase-card.png), traduite en
 * français et nourrie de données réelles. Fond vert profond, bandeau clair à
 * bord ondulé, portrait circulaire cerclé, grand nom, tuiles vitrées, QR dans
 * un panneau blanc, pied à trois cases.
 *
 * Structure (tout est en dixièmes de millimètre, voir `GRID`) :
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ [logos] │ CARTE DE MEMBRE                    [✓ Membre vérifié]│ bandeau, une rangée
 *   │         │ Organisation émettrice                              │
 *   │  ( photo )   Prénom NOM                                        │
 *   │  [niveau]    🏛 COOPÉRATIVE   nom          (👥 UNION   nom)     │
 *   │  N° MEMBRE   ┌ tuile Localité ┐  ┌ QR ┐                         │
 *   │  numéro      └ tuile Téléphone┘  └────┘                         │
 *   │  ─signature─ (bas des tuiles = bas du QR = ligne de signature)  │
 *   │ ─────────────────────────────────────────────────────────────── │
 *   │ VALIDE JUSQU'AU   STATUT ● ━━━━━━━━━   PÉRIODE                  │
 *   └──────────────────────────────────────────────────────────────┘
 *     colonne gauche 22 mm | centre 30,6 mm | droite 22 mm, gouttières 2,5 mm
 *
 * Typographie : Poppins, quatre tailles seulement (`TYPE`) — nom 13 pt
 * (échelle d'ajustement), valeurs 7,5 pt, bandeau 6,5 pt, libellés 6 pt.
 * Aucun texte sous 6 pt à la taille réelle. Le gras (700) ne sert qu'au
 * numéro de carte ; le nom est en demi-gras (600).
 *
 * Le rayon d'angle de 3,18 mm n'est appliqué qu'à l'écran (masque) ; les
 * fichiers d'impression sont à angles vifs, avec 3 mm de fond perdu.
 */

import { encodeText } from '@/lib/utils/qr'
import {
  CARD_FALLBACK_STACK,
  CARD_FONT_PUBLIC_PATH,
  CARD_FONT_STACK,
  cardFontFaceCss,
} from './card-fonts'
import { imageSizeFromDataUrl } from './image-size'
import type { CardSchema } from './schema'
import { type IconName, emblemVector, esc, hashString, icon, leafWatermark } from './security-art'
import {
  type FontWeight,
  PT,
  type TextStyle,
  breakLines,
  ellipsize,
  fallbackWeight,
  fitText,
  fontRuns,
  measureText,
} from './text-metrics'
import { type CardTokens, type Tone, blend, deriveCardTokens } from './tokens'
import { cardVerifyUrl } from './verify-url'

export const TRIM_W = 856
export const TRIM_H = 540
export const BLEED = 30
export const CORNER_RADIUS = 31.8
/** Marge de sécurité : 3 mm de chaque bord rogné. */
export const SAFE = 30
/** Lattice d'export : 1012 px pour la largeur rognée, soit 300 ppp à 0,06 % près. */
export const BASE_PX = 1012
const UNIT = TRIM_W / BASE_PX

/** Plancher typographique : aucun texte sous 6 pt à la taille réelle. */
export const MIN_PT = 6

// ─── Grille et échelle typographique ─────────────────────────────────────────

const GUTTER = 25
const SIDE_COL = 220

/**
 * Grille de la carte. Trois colonnes entre les marges de sécurité ; les bords
 * de ces colonnes sont les seuls alignements verticaux de la carte.
 */
export const GRID = {
  safe: SAFE,
  gutter: GUTTER,
  left: { x: SAFE, w: SIDE_COL },
  centre: { x: SAFE + SIDE_COL + GUTTER, w: TRIM_W - 2 * SAFE - 2 * SIDE_COL - 2 * GUTTER },
  right: { x: TRIM_W - SAFE - SIDE_COL, w: SIDE_COL },
  /** Bas des tuiles = bas du panneau du QR = ligne de signature. */
  dataBottom: 440,
  /** Filet du pied, ligne de base des libellés et des valeurs du pied. */
  footerRule: 450,
  footerLabel: 473,
  footerValue: 502,
} as const

const LEFT = GRID.left
const CENTRE = GRID.centre
const RIGHTCOL = GRID.right
const RIGHT = TRIM_W - SAFE
const CENTRE_END = CENTRE.x + CENTRE.w

/** Échelle typographique : quatre tailles (le nom descend son échelle s'il le faut). */
export const TYPE = {
  name: { pt: 13, minOneLine: 10, minTwoLines: 7.5, weight: 600 },
  value: { pt: 7.5, weight: 500 },
  number: { pt: 7.5, weight: 700 },
  title: { pt: 6.5, weight: 600, trackingEm: 0.12 },
  org: { pt: 6.5, weight: 400 },
  label: { pt: 6, weight: 500, trackingEm: 0.08 },
  small: { pt: 6, weight: 500 },
} as const

/** Pictogrammes : un seul corps partout, posés devant leur libellé ; une seule pastille (portrait). */
export const ICON = 20
export const ICON_DISC = 32
const ICON_GAP = 8
/** Rayons : tuiles 2 mm, panneau du QR 2,5 mm, pastilles en demi-cercle. */
export const RADIUS = { tile: 20, panel: 25 } as const

export interface CardRenderOptions {
  /**
   * `screen` : angles arrondis (masque), zone rognée.
   * `print` : angles vifs, avec fond perdu de 3 mm par défaut.
   */
  mode?: 'screen' | 'print'
  /** Inclut le fond perdu de 3 mm (défaut : oui en `print`, non en `screen`). */
  bleed?: boolean
  /** Photo du membre en data URL (indispensable à tout export raster). */
  photoDataUrl?: string | null
  /**
   * Logo FaîtiereHub (public/logo.png) : data URL pour un export raster, ou
   * URL de même origine pour un SVG inséré dans la page. Absent : emblème
   * vectoriel.
   */
  platformLogo?: string | null
  /** Ajoute width/height : requis par certains moteurs de rasterisation. */
  intrinsicSize?: boolean
  /** Date du jour `AAAA-MM-JJ` : état « expirée » et jauge (test déterministe). */
  asOf?: string
  /**
   * Suffixe des identifiants internes (clipPath, dégradés). Deux copies d'une
   * même carte dans un même document (aperçu et feuille d'impression) doivent
   * en porter des différents.
   */
  idSuffix?: string
  /**
   * Règles @font-face de Poppins insérées dans le SVG. Absent : chemins
   * publics (/fonts/card/…), pour un SVG inséré dans la page. Un export via
   * <img> passe des data URL (renderer.ts). `null` : aucune règle (resvg
   * reçoit les polices directement).
   */
  fontCss?: string | null
  /** Outil de mise au point : superpose la grille. Jamais en production. */
  debugGrid?: boolean
}

// ─── Données → texte ─────────────────────────────────────────────────────────

export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]
const MONTHS_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
]

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/

/** `AAAA-MM-JJ…` → `JJ mois AAAA`, par découpage de chaîne (aucun décalage de fuseau). */
export function formatLongDate(value: string | null | undefined, short = false): string {
  const m = ISO_DATE.exec(value ?? '')
  const month = m ? (short ? MONTHS_SHORT : MONTHS)[Number(m[2]) - 1] : undefined
  return m && month ? `${m[3]} ${month} ${m[1]}` : '—'
}

function yearOf(value: string | null | undefined): string | null {
  return /^(\d{4})-/.exec(value ?? '')?.[1] ?? null
}

/** Période d'adhésion : année de création – année d'échéance, tirées des données. */
export function membershipPeriod(createdAt: string, expiryDate: string): string {
  const from = yearOf(createdAt)
  const to = yearOf(expiryDate)
  if (from && to) return from === to ? from : `${from} – ${to}`
  return from ?? to ?? '—'
}

function dayNumber(value: string | null | undefined): number | null {
  const m = ISO_DATE.exec(value ?? '')
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000
}

/**
 * Part écoulée de la période de validité, de 0 (jour d'émission) à 1
 * (échéance atteinte ou dépassée). `null` si une date manque ou si la période
 * est vide : la jauge reste alors vide, jamais décorative.
 */
export function validityProgress(
  createdAt: string,
  expiryDate: string,
  asOf: string,
): number | null {
  const from = dayNumber(createdAt)
  const to = dayNumber(expiryDate)
  const now = dayNumber(asOf)
  if (from === null || to === null || now === null || to <= from) return null
  return Math.min(1, Math.max(0, (now - from) / (to - from)))
}

export type EffectiveStatus = 'active' | 'expired' | 'revoked' | 'pending' | 'suspended'

/** Un `active` dont l'échéance est passée est expiré, d'après la date, jamais d'un drapeau. */
export function effectiveStatus(member: CardSchema['member'], asOf: string): EffectiveStatus {
  const expiry = ISO_DATE.exec(member.expiryDate)?.[0]
  if (member.status === 'active' && expiry && expiry < asOf) return 'expired'
  return member.status
}

export interface StatusView {
  tone: Tone
  /** Badge du bandeau, sur une ligne : « Membre vérifié » seulement pour une carte active. */
  badge: string
  /** Mot du pied (« statut », au féminin : la carte, l'adhésion). */
  word: string
  verified: boolean
}

const STATUS_VIEWS: Record<EffectiveStatus, StatusView> = {
  active: { tone: 'ok', badge: 'Membre vérifié', word: 'Active', verified: true },
  pending: { tone: 'warn', badge: 'En attente', word: 'En attente', verified: false },
  suspended: { tone: 'warn', badge: 'Carte suspendue', word: 'Suspendue', verified: false },
  expired: { tone: 'danger', badge: 'Carte expirée', word: 'Expirée', verified: false },
  revoked: { tone: 'danger', badge: 'Carte révoquée', word: 'Révoquée', verified: false },
}

export function statusView(status: EffectiveStatus): StatusView {
  return STATUS_VIEWS[status]
}

const LEVEL_WORD = { or: 'Or', argent: 'Argent', bronze: 'Bronze' } as const
const LEVEL_COLOR = { or: '#E2B13C', argent: '#CBD5DC', bronze: '#D08A4E' } as const
const ORG_LABEL = { cooperative: 'COOPÉRATIVE', union: 'UNION', faitiere: 'FAÎTIÈRE' } as const

const strip = (v: string): string =>
  v.normalize('NFD').replace(/\p{M}/gu, '').replace(/[’`]/g, "'").toLocaleLowerCase('fr').trim()

/** Titres par défaut (anciens et actuel) : remplacés par l'intitulé court de la carte. */
const STOCK_TITLES = new Set(['carte de membre', "carte d'identite membre", ''])

/** Titre du bandeau : celui du modèle s'il a été personnalisé, sinon « CARTE DE MEMBRE ». */
export function headerTitle(schema: CardSchema): string {
  const title = schema.template.title ?? ''
  return STOCK_TITLES.has(strip(title)) ? 'CARTE DE MEMBRE' : title.trim().toLocaleUpperCase('fr')
}

/**
 * Organisation émettrice affichée au bandeau : faîtière, sinon union, sinon le
 * registre FaîtiereHub — jamais l'organisation du membre, déjà sous le nom.
 */
function issuerName(schema: CardSchema): string {
  const b = schema.branding
  const own = strip(b.cooperativeName)
  const issuer = [b.faitiereName, b.unionName].find((n) => n && strip(n) !== own)
  return issuer ?? 'FaîtiereHub'
}

function fullName(schema: CardSchema): string {
  const first = schema.member.firstName
  const last = schema.member.lastName.toLocaleUpperCase('fr')
  return `${first} ${last}`.trim()
}

// ─── Primitives SVG ──────────────────────────────────────────────────────────

const n1 = (n: number): string => n.toFixed(1)
const units = (pt: number): number => pt * PT
/** Hauteur de capitale et jambage de Poppins, en unités, pour un corps en points. */
const cap = (pt: number): number => units(pt) * 0.7
const desc = (pt: number): number => units(pt) * 0.24
const track = (pt: number, em: number): number => Math.round(units(pt) * em * 100) / 100

interface TextSpec {
  x: number
  y: number
  pt: number
  s: string
  fill: string
  weight: FontWeight
  anchor?: 'start' | 'middle' | 'end'
  tracking?: number
  /** Compression horizontale de dernier recours. */
  scaleX?: number
}

/**
 * Texte SVG. Les grappes que Poppins ne dessine pas passent en Liberation
 * Sans, chacune dans sa propre « chunk » (`<tspan x=…>`) : resvg met en forme
 * une chunk d'un seul tenant et, dès qu'un glyphe manque, la recompose
 * entière dans la police de repli. Les abscisses viennent de la mesure
 * (text-metrics.ts), identiques pour resvg et le navigateur.
 */
function text(o: TextSpec): string {
  const { x, y, pt, s, fill, weight, tracking = 0, scaleX = 1 } = o
  const runs = fontRuns(s, weight)
  const split = runs.some((r) => r.fallback)
  // Découpé, le texte est posé depuis son début : l'ancrage est calculé ici.
  let anchor = o.anchor ?? 'start'
  let x0 = x
  if (split && anchor !== 'start') {
    const w = measureText(s, units(pt), { weight, tracking }) * scaleX
    x0 = anchor === 'middle' ? x - w / 2 : x - w
    anchor = 'start'
  }
  const common = `font-family="${CARD_FONT_STACK}" font-weight="${weight}" font-size="${n1(units(pt))}" fill="${esc(fill)}"${
    anchor === 'start' ? '' : ` text-anchor="${anchor}"`
  }${tracking ? ` letter-spacing="${tracking}"` : ''}`
  const scaled = scaleX < 0.999
  let body = esc(s)
  if (split) {
    let cx = scaled ? 0 : x0
    body = runs
      .map((r, i) => {
        const at = i === 0 ? '' : ` x="${n1(cx)}"`
        cx += measureText(r.text, units(pt), { weight, tracking })
        return r.fallback
          ? `<tspan${at} font-family="${CARD_FALLBACK_STACK}" font-weight="${fallbackWeight(weight)}">${esc(r.text)}</tspan>`
          : `<tspan${at}>${esc(r.text)}</tspan>`
      })
      .join('')
  }
  if (scaled) {
    return `<text transform="translate(${n1(x0)} ${n1(y)}) scale(${scaleX.toFixed(3)} 1)" ${common}>${body}</text>`
  }
  return `<text x="${n1(x0)}" y="${n1(y)}" ${common}>${body}</text>`
}

function width(s: string, pt: number, weight: FontWeight, tracking = 0): number {
  return measureText(s, units(pt), { weight, tracking })
}

interface Fitted {
  lines: string[]
  pt: number
  scaleX: number
  ellipsized: boolean
}

/**
 * Texte à taille fixe dans une largeur : une ligne, sinon jusqu'à `maxLines`
 * lignes équilibrées ; au-delà, « … » à un mot entier si `ellipsis` (nom
 * d'organisation ou de lieu), sinon compression bornée (numéro, téléphone).
 */
function fitFixed(
  s: string,
  opts: {
    maxWidth: number
    pt: number
    weight: FontWeight
    maxLines: number
    ellipsis: boolean
    tracking?: number
  },
): Fitted {
  const { maxWidth, pt, weight, maxLines, tracking = 0 } = opts
  const style: TextStyle = { weight, tracking }
  const size = units(pt)
  const clean = s.replace(/\s+/g, ' ').trim() || '—'
  for (let lines = 1; lines <= maxLines; lines++) {
    const broken = breakLines(clean, maxWidth, size, style, lines)
    if (broken) return { lines: broken, pt, scaleX: 1, ellipsized: false }
  }
  if (!opts.ellipsis) {
    // Numéro, téléphone : jamais abrégés ; compression bornée en dernier recours.
    return fitText(clean, { maxWidth, prefPt: pt, minPt: pt, maxLines, weight, tracking })
  }
  // Nom d'organisation ou de lieu : lignes pleines, puis « … » à un mot entier.
  const words = clean.split(' ')
  const lines: string[] = []
  let i = 0
  while (lines.length < maxLines - 1 && i < words.length) {
    let line = words[i++]
    while (i < words.length && measureText(`${line} ${words[i]}`, size, style) <= maxWidth) {
      line += ` ${words[i++]}`
    }
    lines.push(line)
  }
  lines.push(ellipsize(words.slice(i).join(' ') || '…', maxWidth, size, style))
  return { lines: lines.filter(Boolean), pt, scaleX: 1, ellipsized: true }
}

// ─── QR ──────────────────────────────────────────────────────────────────────

export interface QrChoice {
  matrix: boolean[][]
  ecc: 'Q' | 'M'
}

/**
 * Matrice du QR : ECC Q tant qu'il ne coûte pas de version de plus que M,
 * sinon M. Pas d'emblème au centre : il imposerait l'ECC H, donc un symbole
 * plus grand. La charge utile ne change jamais (voir verify-url.ts).
 */
export function chooseQr(url: string): QrChoice {
  const q = encodeText(url, 'Q', { mask: 'auto' })
  const m = encodeText(url, 'M', { mask: 'auto' })
  return q.length === m.length ? { matrix: q, ecc: 'Q' } : { matrix: m, ecc: 'M' }
}

const snap = (v: number): number => Math.round(v / UNIT) * UNIT

/** Module : 4 px de la grille d'export, soit 0,338 mm (≥ 0,33 mm). */
const MODULE_PX = 4

interface QrLayout {
  path: string
  /** Origine et échelle du dessin des modules, en unités de carte. */
  x: number
  y: number
  moduleUnits: number
  modules: number
  /** Module en pixels de la grille d'export (1012 px de large pour 85,6 mm). */
  modulePx: number
}

/** Côté de la fenêtre du QR (symbole + 4 modules de silence de chaque côté). */
function qrWindow(modules: number): number {
  return (modules + 8) * MODULE_PX * UNIT
}

/**
 * Dessin du QR calé sur la grille d'export : chaque module vaut un nombre
 * ENTIER de pixels à 300 ppp (et à tout multiple entier), donc aucune frange
 * de demi-pixel aux bords. `top` : haut de la zone de silence.
 */
function layoutQr(matrix: boolean[][], cx: number, top: number): QrLayout {
  const n = matrix.length
  const moduleUnits = MODULE_PX * UNIT
  const codeSize = n * moduleUnits
  const x = snap(cx - codeSize / 2)
  const y = snap(top + 4 * moduleUnits)
  let path = ''
  for (let row = 0; row < n; row++) {
    let col = 0
    while (col < n) {
      if (!matrix[row][col]) {
        col++
        continue
      }
      let end = col
      while (end < n && matrix[row][end]) end++
      path += `M${col} ${row}h${end - col}v1h-${end - col}z`
      col = end
    }
  }
  return { path, x, y, moduleUnits, modules: n, modulePx: MODULE_PX }
}

/** Titre du panneau : « Scanner pour vérifier » s'il tient sur une ligne, sinon plus court. */
const PANEL_TITLES = ['Scanner pour vérifier', 'Vérifier en ligne'] as const
const PANEL_PAD = 8
const PANEL_TITLE_TOP = 10

function panelTitle(): string {
  const avail = RIGHTCOL.w - 2 * PANEL_PAD
  return (
    PANEL_TITLES.find((s) => width(s, TYPE.small.pt, TYPE.small.weight) <= avail) ??
    PANEL_TITLES[PANEL_TITLES.length - 1]
  )
}

/** Hauteur minimale du panneau : titre, puis fenêtre du QR (silence compris). */
function panelMinHeight(modules: number): number {
  return PANEL_TITLE_TOP + cap(TYPE.small.pt) + desc(TYPE.small.pt) + 2 + qrWindow(modules) + 2
}

// ─── Contexte de rendu ───────────────────────────────────────────────────────

interface Ctx {
  schema: CardSchema
  t: CardTokens
  uid: string
  status: EffectiveStatus
  view: StatusView
  progress: number | null
  photo: string | null
  logo: string | null
}

function makeCtx(schema: CardSchema, opts: CardRenderOptions): Ctx {
  const t = deriveCardTokens({
    brand: schema.branding.brandColor,
    accent: schema.branding.accentColor,
  })
  const seedSource = schema.branding.organisationId ?? schema.branding.cooperativeName
  const uid = `${hashString(`${schema.member.cardNumber}|${seedSource}`).toString(36)}${opts.idSuffix ?? ''}`
  const asOf = opts.asOf ?? todayIso()
  const status = effectiveStatus(schema.member, asOf)
  const progress =
    status === 'expired'
      ? 1
      : validityProgress(schema.member.createdAt, schema.member.expiryDate, asOf)
  return {
    schema,
    t,
    uid,
    status,
    view: statusView(status),
    progress,
    photo: opts.photoDataUrl ?? schema.member.photoUrl ?? null,
    logo: opts.platformLogo ?? null,
  }
}

// ─── Bandeau ─────────────────────────────────────────────────────────────────

const HEADER = { top: SAFE, mid: SAFE + 25, logo: 50, titleCapTop: 34, orgPitch: 26, orgLine: 25 }
/** Bas du bandeau quand l'organisation tient sur une ligne : la vague est dessinée pour lui. */
const HEADER_BOTTOM_BASE =
  HEADER.titleCapTop + cap(TYPE.title.pt) + HEADER.orgPitch + desc(TYPE.org.pt)

/** Bord ondulé du bandeau, de droite à gauche : départ puis courbes de Bézier. */
const WAVE_START: [number, number] = [TRIM_W + BLEED, 84]
const WAVE: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [840, 88, 770, 98, 690, 98],
  [600, 98, 480, 92, 380, 95],
  [270, 98, 160, 118, -BLEED, 134],
]

function wavePoints(dy: (x: number) => number): [number, number][] {
  const pts: [number, number][] = [WAVE_START]
  for (const s of WAVE) pts.push([s[0], s[1]], [s[2], s[3]], [s[4], s[5]])
  return pts.map(([x, y]) => [x, y + dy(x)])
}

function curveThrough(pts: [number, number][]): string {
  let d = `L${n1(pts[0][0])} ${n1(pts[0][1])}`
  for (let i = 1; i < pts.length; i += 3) {
    d += `C${pts
      .slice(i, i + 3)
      .map(([x, y]) => `${n1(x)} ${n1(y)}`)
      .join(' ')}`
  }
  return d
}

function bandPath(shift: number): string {
  return `M${-BLEED} ${-BLEED}H${TRIM_W + BLEED}${curveThrough(wavePoints(() => shift))}Z`
}

/** Vague lumineuse sous le bandeau : épaisse à gauche et à droite, fine au milieu. */
function swooshPath(shift: number): string {
  const top = curveThrough(wavePoints(() => shift)).replace(/^L[^C]+/, '')
  const bottom = curveThrough(
    wavePoints((x) => shift + (x > 700 ? 24 : x > 450 ? 6 : x > 200 ? 5 : 16)).reverse(),
  )
  return `M${WAVE_START[0]} ${WAVE_START[1] + shift}${top}${bottom}Z`
}

interface BadgeGeom {
  svg: string
  x: number
}

function badge(ctx: Ctx): BadgeGeom {
  const { t, view } = ctx
  const tone = t.tones[view.tone]
  const { pt, weight } = TYPE.small
  const h = 40
  const w = 12 + ICON + 7 + width(view.badge, pt, weight) + 13
  const x = RIGHT - w
  const y = HEADER.mid - h / 2
  const glyph: IconName =
    view.tone === 'ok' ? 'shield-check' : view.tone === 'warn' ? 'shield-alert' : 'shield-cross'
  const svg = `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${h}" rx="${h / 2}" fill="${tone.badgeFill}" stroke="${tone.badgeStroke}" stroke-width="1.2"/>
    ${icon(glyph, x + 12 + ICON / 2, HEADER.mid, ICON, tone.badgeText, tone.badgeFill)}
    ${text({ x: x + 12 + ICON + 7, y: HEADER.mid + cap(pt) / 2, pt, s: view.badge, fill: tone.badgeText, weight })}`
  return { svg, x }
}

/** Logo d'organisation (faîtière, sinon coopérative) à côté de celui de FaîtiereHub. */
function tenantLogo(schema: CardSchema): { href: string; aspect: number } | null {
  const b = schema.branding
  if (b.faitiereLogoUrl) return { href: b.faitiereLogoUrl, aspect: b.faitiereLogoAspect ?? 1 }
  if (b.cooperativeLogoUrl)
    return { href: b.cooperativeLogoUrl, aspect: b.cooperativeLogoAspect ?? 1 }
  return null
}

function platformEmblem(ctx: Ctx, cx: number, cy: number, r: number, id: string): string {
  const { t, logo } = ctx
  if (!logo) return emblemVector(cx, cy, r, t.greenDark, t.green)
  // Recadrage du disque de public/logo.png (400 × 267, disque centré en 200, 84).
  const k = r / 24
  return `<clipPath id="${id}"><circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(23 * k)}"/></clipPath>
    <circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}" fill="#FFFFFF"/>
    <image href="${esc(logo)}" xlink:href="${esc(logo)}" x="${n1(cx - 66.7 * k)}" y="${n1(cy - 28 * k)}" width="${n1(133.3 * k)}" height="${n1(89 * k)}" clip-path="url(#${id})"/>`
}

interface HeaderOut {
  svg: string
  title: string[]
  issuer: string[]
  /** Bas du texte du bandeau ; la vague descend d'autant si l'organisation prend deux lignes. */
  bottom: number
  titleX: number
  badgeX: number
}

function header(ctx: Ctx): HeaderOut {
  const { schema, t, uid } = ctx
  const out: string[] = []
  const size = HEADER.logo

  // Logos à hauteur égale : FaîtiereHub, puis l'organisation s'il y en a un.
  const r = size / 2
  out.push(platformEmblem(ctx, SAFE + r, HEADER.mid, r, `lg${uid}`))
  let x = SAFE + size
  const tenant = tenantLogo(schema)
  if (tenant) {
    x += 10
    const w = Math.min(110, Math.max(size, size * tenant.aspect))
    const y = HEADER.mid - size / 2
    out.push(`<clipPath id="tl${uid}"><rect x="${n1(x)}" y="${y}" width="${n1(w)}" height="${size}" rx="8"/></clipPath>
      <rect x="${n1(x)}" y="${y}" width="${n1(w)}" height="${size}" rx="8" fill="#FFFFFF" stroke="${t.bandRule}" stroke-width="1"/>
      <g clip-path="url(#tl${uid})"><image href="${esc(tenant.href)}" xlink:href="${esc(tenant.href)}" x="${n1(x + 4)}" y="${y + 4}" width="${n1(w - 8)}" height="${size - 8}" preserveAspectRatio="xMidYMid meet"/></g>`)
    x += w
  }
  const ruleX = x + 14
  out.push(
    `<rect x="${n1(ruleX)}" y="${HEADER.mid - 22}" width="1.2" height="44" fill="${t.bandRule}"/>`,
  )
  const titleX = ruleX + 15

  const b = badge(ctx)
  const avail = b.x - 20 - titleX

  // Titre : capitales espacées, sur une ligne ; l'espacement se resserre avant
  // toute coupure, et un titre personnalisé démesuré reçoit « … ».
  const titleText = headerTitle(schema)
  const { pt: tPt, weight: tW } = TYPE.title
  let title: { s: string; tracking: number } | null = null
  for (const em of [TYPE.title.trackingEm, 0.06, 0]) {
    const tracking = track(tPt, em)
    if (width(titleText, tPt, tW, tracking) <= avail) {
      title = { s: titleText, tracking }
      break
    }
  }
  if (!title) {
    const f = fitFixed(titleText, {
      maxWidth: avail,
      pt: tPt,
      weight: tW,
      maxLines: 1,
      ellipsis: true,
    })
    title = { s: f.lines[0], tracking: 0 }
  }
  // Organisation émettrice : une ligne, sinon deux, sinon « … » au bout de la deuxième.
  const issuer = fitFixed(issuerName(schema), {
    maxWidth: avail,
    pt: TYPE.org.pt,
    weight: TYPE.org.weight,
    maxLines: 2,
    ellipsis: true,
  })

  const titleBase = HEADER.titleCapTop + cap(tPt)
  out.push(
    text({
      x: titleX,
      y: titleBase,
      pt: tPt,
      s: title.s,
      fill: t.bandInk,
      weight: tW,
      tracking: title.tracking,
    }),
  )
  let y = titleBase + HEADER.orgPitch
  issuer.lines.forEach((line, i) => {
    if (i > 0) y += HEADER.orgLine
    out.push(
      text({ x: titleX, y, pt: TYPE.org.pt, s: line, fill: t.bandMuted, weight: TYPE.org.weight }),
    )
  })
  out.push(b.svg)
  return {
    svg: out.join(''),
    title: [title.s],
    issuer: issuer.lines,
    bottom: y + desc(TYPE.org.pt),
    titleX,
    badgeX: b.x,
  }
}

// ─── Portrait et colonne gauche ──────────────────────────────────────────────

/** Portrait : centre, rayon de l'image (disque de 14 mm), anneau. */
const PHOTO = { cx: LEFT.x + LEFT.w / 2, cy: 198, r: 70, ring: 5.5, ringW: 7 }
/** Recadrage vertical d'un portrait : part de l'excédent retirée en haut (le reste en bas). */
const PORTRAIT_TOP_SHARE = 0.15
/** Proportions supposées quand l'image n'est pas lisible : photo d'identité 7:9. */
const ID_PHOTO_ASPECT = 7 / 9
/** En dessous, la photo est agrandie à l'impression (signalé, jamais bloquant). */
export const PHOTO_MIN_PPI = 300

export interface PhotoFrame {
  /** Boîte de l'image, aux proportions de la source, qui couvre tout le disque. */
  x: number
  y: number
  width: number
  height: number
  /** Proportions retenues (largeur / hauteur) et si elles ont été lues dans l'image. */
  aspect: number
  measured: boolean
  /** Définition effective à la taille réelle du disque ; `null` si inconnue. */
  ppi: number | null
}

/** Disque du portrait, en unités de carte. */
export const PHOTO_CIRCLE = { cx: PHOTO.cx, cy: PHOTO.cy, r: PHOTO.r } as const

/**
 * Cadrage de la photo dans le disque du portrait, sans jamais la déformer :
 * « cover » d'après la taille réelle de l'image (lue dans son en-tête). Un
 * portrait est centré horizontalement et recadré surtout par le bas (15 % de
 * l'excédent seulement en haut) : on garde le front, on coupe les épaules.
 * Une image carrée ou en paysage est centrée. Taille illisible : on suppose le
 * 7:9 des photos d'identité recadrées (« -face.jpg »).
 */
export function photoFrame(
  size: readonly [number, number] | null,
  circle: { cx: number; cy: number; r: number } = PHOTO_CIRCLE,
): PhotoFrame {
  const { cx, cy, r } = circle
  const d = r * 2
  const aspect = size ? size[0] / size[1] : ID_PHOTO_ASPECT
  const ppi = size ? Math.min(size[0], size[1]) / (d / 254) : null
  if (aspect >= 1) {
    const width = d * aspect
    return { x: cx - width / 2, y: cy - r, width, height: d, aspect, measured: !!size, ppi }
  }
  const height = d / aspect
  const excess = height - d
  return {
    x: cx - r,
    y: cy - r - excess * PORTRAIT_TOP_SHARE,
    width: d,
    height,
    aspect,
    measured: !!size,
    ppi,
  }
}

function portrait(ctx: Ctx): string {
  const { t, uid, photo, view } = ctx
  const { cx, cy, r, ring, ringW } = PHOTO
  const ringR = r + ring
  // Sans photo : silhouette neutre, jamais un visage d'exemple. Avec photo :
  // boîte aux proportions réelles ; `slice` (aligné en haut) garantit en plus
  // qu'une taille mal lue (orientation EXIF d'un original) ne déforme jamais.
  const frame = photo ? photoFrame(imageSizeFromDataUrl(photo)) : null
  const inside = frame
    ? `<image href="${esc(photo ?? '')}" xlink:href="${esc(photo ?? '')}" x="${n1(frame.x)}" y="${n1(frame.y)}" width="${n1(frame.width)}" height="${n1(frame.height)}" preserveAspectRatio="xMidYMin slice" data-photo-ppi="${frame.ppi === null ? 'inconnue' : Math.round(frame.ppi)}"/>`
    : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${blend(t.bgDeep, t.accentDark, 0.55)}"/><g fill="${t.accentLight}" fill-opacity="0.38" data-placeholder="photo"><circle cx="${cx}" cy="${cy - 15}" r="24"/><path d="M${cx - 54} ${cy + r}C${cx - 52} ${cy + 24} ${cx - 29} ${cy + 15} ${cx} ${cy + 15}S${cx + 52} ${cy + 24} ${cx + 54} ${cy + r}Z"/></g>`
  const image = `<clipPath id="ph${uid}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath><g clip-path="url(#ph${uid})">${inside}</g>`
  const bx = cx + ringR * Math.SQRT1_2
  const by = cy + ringR * Math.SQRT1_2
  const shield = view.verified
    ? `<circle cx="${n1(bx)}" cy="${n1(by)}" r="${ICON_DISC / 2}" fill="${t.bgDeep}" stroke="#FFFFFF" stroke-width="1.6"/>${icon('shield-check', bx, by, ICON, '#FFFFFF', t.bgDeep)}`
    : ''
  return `<circle cx="${cx}" cy="${cy}" r="${r + 28}" fill="url(#pg${uid})"/>
    <circle cx="${cx}" cy="${cy}" r="${n1(ringR + 6)}" fill="none" stroke="${t.accentLight}" stroke-opacity="0.35" stroke-width="1.2"/>
    ${image}
    <circle cx="${cx}" cy="${cy}" r="${n1(ringR)}" fill="none" stroke="url(#rg${uid})" stroke-width="${ringW}"/>
    <circle cx="${cx}" cy="${cy}" r="${r + 0.6}" fill="none" stroke="#FFFFFF" stroke-opacity="0.85" stroke-width="1.2"/>
    ${shield}`
}

/** Libellé de champ : 6 pt, capitales espacées, vert atténué. */
function label(t: CardTokens, x: number, y: number, s: string, anchor?: 'middle'): string {
  const { pt, weight, trackingEm } = TYPE.label
  return text({ x, y, pt, s, fill: t.label, weight, tracking: track(pt, trackingEm), anchor })
}

const labelWidth = (s: string): number =>
  width(s, TYPE.label.pt, TYPE.label.weight, track(TYPE.label.pt, TYPE.label.trackingEm))

interface ColumnOut {
  svg: string
  number: string[]
  /** Ligne de signature : son ordonnée est le bas des tuiles et du QR. */
  signatureY: number
}

function leftColumn(ctx: Ctx): ColumnOut {
  const { schema, t, uid } = ctx
  const out: string[] = []
  const ringBottom = PHOTO.cy + PHOTO.r + PHOTO.ring + PHOTO.ringW / 2
  let y = ringBottom + 8

  // Niveau réel (get_member_score), en pastille sous le portrait.
  const level = schema.member.level
  if (level) {
    const { pt, weight } = TYPE.small
    const word = LEVEL_WORD[level]
    const h = 32
    const w = 10 + ICON + 6 + width(word, pt, weight) + 12
    const x = PHOTO.cx - w / 2
    out.push(
      `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${h}" rx="${h / 2}" fill="${t.bgDeep}" fill-opacity="0.55" stroke="#FFFFFF" stroke-opacity="0.28" stroke-width="1.2"/>`,
      icon('medal', x + 10 + ICON / 2, y + h / 2, ICON, LEVEL_COLOR[level]),
      text({ x: x + 10 + ICON + 6, y: y + h / 2 + cap(pt) / 2, pt, s: word, fill: t.text, weight }),
    )
    y += h
  }

  // Numéro : jamais abrégé ; un numéro hors format se replie aux traits d'union.
  const labelY = y + 10 + cap(TYPE.label.pt)
  out.push(label(t, LEFT.x, labelY, 'N° MEMBRE'))
  const { pt, weight } = TYPE.number
  const num = fitFixed(schema.member.cardNumber || '—', {
    maxWidth: LEFT.w,
    pt,
    weight,
    maxLines: 3,
    ellipsis: false,
  })
  const pitch = 27
  let base = labelY + 27
  num.lines.forEach((line, i) => {
    out.push(
      text({
        x: LEFT.x,
        y: base + i * pitch,
        pt,
        s: line,
        fill: t.text,
        weight,
        scaleX: num.scaleX,
      }),
    )
  })
  base += (num.lines.length - 1) * pitch

  // Signature : l'image réelle du membre, blanchie pour le fond sombre ; sinon
  // une ligne vierge. Jamais de paraphe inventé.
  // Bloc de signature à hauteur fixe au-dessus de la ligne (libellé, espace
  // d'écriture) ; il ne remonte jamais, il ne descend que si le numéro l'y oblige.
  const sigLine = GRID.dataBottom
  const sigLabel = Math.min(
    sigLine - 8,
    Math.max(sigLine - 40, base + desc(pt) + 12 + cap(TYPE.label.pt)),
  )
  out.push(label(t, LEFT.x, sigLabel, 'SIGNATURE'))
  const boxTop = sigLabel + 5
  const sig = schema.member.signatureUrl
  if (sig && sigLine - 3 - boxTop >= 16) {
    out.push(
      `<clipPath id="sc${uid}"><rect x="${LEFT.x}" y="${n1(boxTop)}" width="${LEFT.w}" height="${n1(sigLine - boxTop)}"/></clipPath>`,
      `<g clip-path="url(#sc${uid})"><image href="${esc(sig)}" xlink:href="${esc(sig)}" x="${LEFT.x}" y="${n1(boxTop)}" width="${LEFT.w}" height="${n1(sigLine - 3 - boxTop)}" preserveAspectRatio="xMinYMax meet" filter="url(#sg${uid})" data-signature="1"/></g>`,
    )
  }
  out.push(
    `<rect x="${LEFT.x}" y="${sigLine - 0.6}" width="${LEFT.w}" height="1.2" fill="#FFFFFF" fill-opacity="0.45"/>`,
  )
  return { svg: out.join(''), number: num.lines, signatureY: sigLine }
}

// ─── Nom, organisation, tuiles ───────────────────────────────────────────────

interface NamePlan {
  lines: string[]
  pt: number
  first: number
  pitch: number
  last: number
  scaleX: number
}

const NAME_CAP_TOP = 118
const NAME_WIDTH = RIGHT - CENTRE.x

/**
 * Nom : une ligne de 13 à 10 pt sur la largeur centre + droite ; sinon deux
 * lignes (de 10 à 7,5 pt), puis trois à 7,5 pt. Jamais tronqué ni abrégé.
 */
function planName(name: string, capTop: number): NamePlan {
  const { weight } = TYPE.name
  const plan = (lines: string[], pt: number, scaleX = 1): NamePlan => {
    const pitch = units(pt) * 1.1
    const first = capTop + cap(pt)
    return { lines, pt, first, pitch, last: first + (lines.length - 1) * pitch, scaleX }
  }
  const ladders: [number, number, number][] = [
    [1, TYPE.name.pt, TYPE.name.minOneLine],
    [2, TYPE.name.minOneLine, TYPE.name.minTwoLines],
    [3, TYPE.name.minTwoLines, TYPE.name.minTwoLines],
  ]
  for (const [count, from, to] of ladders) {
    for (let pt = from; pt >= to - 1e-9; pt -= 0.5) {
      const lines = breakLines(name, NAME_WIDTH, units(pt), { weight }, count)
      if (lines && lines.length === count) return plan(lines, pt)
      if (lines && count === 1) return plan(lines, pt)
    }
  }
  // Nom d'un seul mot démesuré : compression horizontale bornée (jamais d'ellipse).
  const f = fitText(name, {
    maxWidth: NAME_WIDTH,
    prefPt: TYPE.name.minTwoLines,
    minPt: TYPE.name.minTwoLines,
    maxLines: 3,
    weight,
  })
  return plan(f.lines, f.pt, f.scaleX)
}

interface LineageRow {
  icon: IconName
  label: string
  value: string
}

/**
 * Lignée affichée sous le nom : l'organisation du membre, puis l'union quand
 * le bandeau porte déjà la faîtière (sinon c'est l'union qui est au bandeau).
 * Chaque organisation n'apparaît qu'une fois sur la carte.
 */
function lineageRows(schema: CardSchema): LineageRow[] {
  const b = schema.branding
  const rows: LineageRow[] = [
    { icon: 'building', label: ORG_LABEL[b.organisationLevel], value: b.cooperativeName || '—' },
  ]
  const union = b.unionName
  if (union && ![strip(issuerName(schema)), strip(b.cooperativeName)].includes(strip(union))) {
    rows.push({ icon: 'people', label: 'UNION', value: union })
  }
  return rows
}

interface TileSpec {
  icon: IconName
  label: string
  value: string
  /** Valeur abrégeable (« … ») en tout dernier recours : jamais un téléphone. */
  ellipsis: boolean
  /** Formes plus courtes, toutes tirées des données, à essayer avant « … ». */
  shorter?: string[]
}

/** Localité sans ses niveaux intermédiaires : village, préfecture, région ; puis village, région. */
function shorterLocalities(locality: string): string[] {
  const parts = locality.split(', ')
  if (parts.length < 3) return []
  const last = parts.length - 1
  return [parts.filter((_, i) => i !== 1), [parts[0], parts[last]]]
    .map((p) => p.join(', '))
    .filter((v, i, all) => v !== locality && all.indexOf(v) === i)
}

function tileSpecs(schema: CardSchema): TileSpec[] {
  const { member } = schema
  return [
    {
      icon: 'pin',
      label: 'LOCALITÉ',
      value: member.locality || '—',
      ellipsis: true,
      shorter: shorterLocalities(member.locality),
    },
    { icon: 'phone', label: 'TÉLÉPHONE', value: member.phone || '—', ellipsis: false },
  ]
}

/** Tuile : marge, ligne du libellé, lignes de valeur. */
const TILE = { pad: 10, inset: 10, labelToValue: 27.5, valuePitch: 28, gap: 10 }
const tileNeed = (lines: number): number =>
  TILE.pad +
  cap(TYPE.label.pt) +
  TILE.labelToValue +
  (lines - 1) * TILE.valuePitch +
  desc(TYPE.value.pt) +
  TILE.pad

/** Écart entre la lignée et le bloc des tuiles : souhaité, minimal ; hauteur maximale du bloc. */
const DATA_GAP = { pref: 24, min: 10 }
const DATA_MAX_H = 205
const ROW_PITCH = 30

interface MiddleOut {
  svg: string
  name: string[]
  lineage: { label: string; lines: string[] }[]
  tiles: { label: string; lines: string[] }[]
  tileRects: { x: number; y: number; w: number; h: number }[]
  lineageX: number
  dataTop: number
  dataHeight: number
}

function middle(ctx: Ctx, headerBottom: number, qrMin: number): MiddleOut {
  const { schema, t, uid } = ctx
  const out: string[] = []
  const shift = Math.max(0, headerBottom - HEADER_BOTTOM_BASE)

  // Nom.
  const name = planName(fullName(schema) || '—', NAME_CAP_TOP + shift)
  name.lines.forEach((line, i) => {
    out.push(
      text({
        x: CENTRE.x,
        y: name.first + i * name.pitch,
        pt: name.pt,
        s: line,
        fill: t.text,
        weight: TYPE.name.weight,
        scaleX: name.scaleX,
      }),
    )
  })

  // Tuiles : hauteur naturelle (valeurs entières sur deux lignes au plus).
  const specs = tileSpecs(schema)
  const tileW = CENTRE.w
  const fitValue = (value: string, ellipsis: boolean) =>
    fitFixed(value, {
      maxWidth: tileW - 2 * TILE.inset,
      pt: TYPE.value.pt,
      weight: TYPE.value.weight,
      maxLines: 2,
      ellipsis,
    })
  const values = specs.map((spec) => {
    const full = fitValue(spec.value, spec.ellipsis)
    if (!full.ellipsized || !spec.shorter) return full
    // Localité trop longue : on retire les niveaux intermédiaires (canton,
    // puis préfecture) avant toute « … », en gardant le village et la région.
    for (const candidate of spec.shorter) {
      const f = fitValue(candidate, true)
      if (!f.ellipsized) return f
    }
    return full
  })
  const tilesNatural =
    values.reduce((sum, v) => sum + tileNeed(v.lines.length), 0) + TILE.gap * (values.length - 1)
  const dataMin = Math.max(qrMin, tilesNatural)

  // Lignée : libellés alignés, valeurs alignées ; deux lignes par valeur si la
  // place le permet, sinon une, avec « … » au bout d'un nom d'organisation.
  const rows = lineageRows(schema)
  const labelX = CENTRE.x + ICON + ICON_GAP
  const valueX = labelX + Math.max(...rows.map((r) => labelWidth(r.label))) + 14
  const firstBase = name.last + desc(name.pt) + 10 + cap(TYPE.value.pt)
  const fitRow = (r: LineageRow, maxLines: number) =>
    fitFixed(r.value, {
      maxWidth: RIGHT - valueX,
      pt: TYPE.value.pt,
      weight: TYPE.value.weight,
      maxLines,
      ellipsis: true,
    })
  const bottomOf = (fits: Fitted[]) => {
    let b = firstBase
    fits.forEach((f, i) => {
      if (i > 0) b += ROW_PITCH
      b += (f.lines.length - 1) * TILE.valuePitch
    })
    return b + desc(TYPE.value.pt)
  }
  // Ordre de repli quand la place manque (nom sur deux lignes, organisation
  // sur deux lignes au bandeau) : l'union se resserre puis s'efface avant que
  // l'organisation du membre, qui n'est écrite qu'ici, ne soit abrégée.
  const plans: [number, number][] = [
    [3, 2],
    [3, 1],
    [3, 0],
    [2, 1],
    [2, 0],
    [1, 1],
    [1, 0],
  ]
  let fits: Fitted[] = []
  for (const [own, union] of plans) {
    fits = [fitRow(rows[0], own), ...(rows[1] && union > 0 ? [fitRow(rows[1], union)] : [])]
    if (bottomOf(fits) + DATA_GAP.min <= GRID.dataBottom - dataMin) break
  }
  const shown = rows.slice(0, fits.length)
  const flowBottom = bottomOf(fits)

  // Bloc des tuiles et du QR, ancré sur la ligne de signature.
  const dataHeight = Math.min(
    DATA_MAX_H,
    Math.max(dataMin, GRID.dataBottom - flowBottom - DATA_GAP.pref),
  )
  const dataTop = GRID.dataBottom - dataHeight

  let base = firstBase
  const lineage: MiddleOut['lineage'] = []
  shown.forEach((row, i) => {
    if (i > 0) base += ROW_PITCH
    const f = fits[i]
    out.push(
      icon(row.icon, CENTRE.x + ICON / 2, base - cap(TYPE.value.pt) / 2, ICON, t.label),
      label(t, labelX, base, row.label),
    )
    f.lines.forEach((line, j) => {
      out.push(
        text({
          x: valueX,
          y: base + j * TILE.valuePitch,
          pt: TYPE.value.pt,
          s: line,
          fill: t.text,
          weight: TYPE.value.weight,
        }),
      )
    })
    base += (f.lines.length - 1) * TILE.valuePitch
    lineage.push({ label: row.label, lines: f.lines })
  })

  // Tuiles vitrées, empilées dans la colonne centrale ; l'excédent de hauteur
  // est partagé, le contenu reste centré.
  const extra = (dataHeight - tilesNatural) / specs.length
  let y = dataTop
  const tiles: MiddleOut['tiles'] = []
  const tileRects: MiddleOut['tileRects'] = []
  specs.forEach((spec, i) => {
    const v = values[i]
    const h = tileNeed(v.lines.length) + extra
    const x = CENTRE.x
    const oy = y + extra / 2
    const labelBase = oy + TILE.pad + cap(TYPE.label.pt)
    const tx = x + TILE.inset
    out.push(
      `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(tileW)}" height="${n1(h)}" rx="${RADIUS.tile}" fill="url(#gl${uid})" stroke="${t.greenLight}" stroke-opacity="0.3" stroke-width="1.2"/>`,
      icon(spec.icon, tx + ICON / 2, labelBase - cap(TYPE.label.pt) / 2, ICON, t.label),
      label(t, tx + ICON + ICON_GAP, labelBase, spec.label),
    )
    v.lines.forEach((line, j) => {
      out.push(
        text({
          x: tx,
          y: labelBase + TILE.labelToValue + j * TILE.valuePitch,
          pt: TYPE.value.pt,
          s: line,
          fill: t.text,
          weight: TYPE.value.weight,
          scaleX: v.scaleX,
        }),
      )
    })
    tiles.push({ label: spec.label, lines: v.lines })
    tileRects.push({ x, y, w: tileW, h })
    y += h + TILE.gap
  })

  return {
    svg: out.join(''),
    name: name.lines,
    lineage,
    tiles,
    tileRects,
    lineageX: CENTRE.x,
    dataTop,
    dataHeight,
  }
}

// ─── Panneau du QR ───────────────────────────────────────────────────────────

interface PanelPlan {
  url: string
  choice: QrChoice
  layout: QrLayout
  top: number
  height: number
  title: string
  titleBase: number
}

function panelPlan(schema: CardSchema, top: number, height: number): PanelPlan {
  const url = cardVerifyUrl({ cardNumber: schema.member.cardNumber })
  const choice = chooseQr(url)
  const title = panelTitle()
  const titleBase = top + PANEL_TITLE_TOP + cap(TYPE.small.pt)
  const below = titleBase + desc(TYPE.small.pt) + 2
  const win = qrWindow(choice.matrix.length)
  const free = top + height - 2 - below - win
  const layout = layoutQr(choice.matrix, RIGHTCOL.x + RIGHTCOL.w / 2, below + Math.max(0, free) / 2)
  return { url, choice, layout, top, height, title, titleBase }
}

function qrPanel(ctx: Ctx, plan: PanelPlan): string {
  const { t, uid } = ctx
  const { layout: qr } = plan
  const { x, w } = RIGHTCOL
  return `<rect x="${x - 5}" y="${n1(plan.top - 5)}" width="${w + 10}" height="${n1(plan.height + 10)}" rx="${RADIUS.panel + 5}" fill="${t.green}" fill-opacity="0.5" filter="url(#bl${uid})"/>
    <rect x="${x}" y="${n1(plan.top)}" width="${w}" height="${n1(plan.height)}" rx="${RADIUS.panel}" fill="${t.panel}"/>
    ${text({ x: x + w / 2, y: plan.titleBase, pt: TYPE.small.pt, s: plan.title, fill: t.panelInk, weight: TYPE.small.weight, anchor: 'middle' })}
    <g transform="translate(${n1(qr.x)} ${n1(qr.y)}) scale(${qr.moduleUnits.toFixed(4)})" fill="${t.qr}" shape-rendering="crispEdges"><path d="${qr.path}"/></g>`
}

export interface CardQrInfo {
  url: string
  ecc: 'Q' | 'M'
  version: number
  modules: number
  /** Côté d'un module en mm et en pixels de la grille d'export (300 ppp). */
  moduleMm: number
  modulePx: number
  /** Côté du symbole, en mm. */
  symbolMm: number
  /** Zone de silence minimale (blanc pur, sans texte), en modules, sur les quatre côtés. */
  quietZoneModules: number
}

function qrInfo(plan: PanelPlan): CardQrInfo {
  const { layout } = plan
  const m = layout.moduleUnits
  const code = layout.modules * m
  const titleBottom = plan.titleBase + desc(TYPE.small.pt)
  const quiet = Math.min(
    layout.x - RIGHTCOL.x,
    RIGHTCOL.x + RIGHTCOL.w - (layout.x + code),
    layout.y - titleBottom,
    plan.top + plan.height - (layout.y + code),
  )
  return {
    url: plan.url,
    ecc: plan.choice.ecc,
    version: (layout.modules - 17) / 4,
    modules: layout.modules,
    moduleMm: m / 10,
    modulePx: layout.modulePx,
    symbolMm: code / 10,
    quietZoneModules: quiet / m,
  }
}

// ─── Pied ────────────────────────────────────────────────────────────────────

interface FooterOut {
  svg: string
  date: string
  word: string
  period: string
  /** Largeur de la jauge et de sa partie remplie (tests). */
  bar: { track: number; fill: number }
  cells: number[]
}

const FOOTER_LABELS = { a: "VALIDE JUSQU'AU", b: 'STATUT', c: 'PÉRIODE' } as const

function footer(ctx: Ctx): FooterOut {
  const { schema, t, view, progress, uid } = ctx
  const tone = t.tones[view.tone]
  const out: string[] = []
  const { pt, weight } = TYPE.value
  const { footerRule, footerLabel, footerValue } = GRID
  const long = formatLongDate(schema.member.expiryDate)
  const date =
    width(long, pt, weight) <= LEFT.w ? long : formatLongDate(schema.member.expiryDate, true)
  const period = membershipPeriod(schema.member.createdAt, schema.member.expiryDate)

  out.push(
    `<rect x="${SAFE}" y="${footerRule - 0.6}" width="${RIGHT - SAFE}" height="1.2" fill="#FFFFFF" fill-opacity="0.16"/>`,
    label(t, LEFT.x, footerLabel, FOOTER_LABELS.a),
    text({ x: LEFT.x, y: footerValue, pt, s: date, fill: t.text, weight }),
    label(t, CENTRE.x, footerLabel, FOOTER_LABELS.b),
    label(t, RIGHTCOL.x, footerLabel, FOOTER_LABELS.c),
    text({ x: RIGHTCOL.x, y: footerValue, pt, s: period, fill: t.text, weight }),
  )

  // Statut, point et jauge de la période écoulée, sur la largeur du centre.
  const wordFill = view.tone === 'ok' ? t.text : tone.onDark
  out.push(text({ x: CENTRE.x, y: footerValue, pt, s: view.word, fill: wordFill, weight }))
  const dotX = CENTRE.x + width(view.word, pt, weight) + 11
  const dotY = footerValue - cap(pt) / 2
  out.push(
    `<circle cx="${n1(dotX)}" cy="${n1(dotY)}" r="7.5" fill="${tone.dot}" fill-opacity="0.25"/>`,
    `<circle cx="${n1(dotX)}" cy="${n1(dotY)}" r="4.2" fill="${tone.dot}"/>`,
  )
  const trackX = dotX + 15
  const trackW = Math.max(0, CENTRE_END - trackX)
  const fill = progress === null ? 0 : progress * trackW
  if (trackW > 0) {
    out.push(
      `<rect x="${n1(trackX)}" y="${n1(dotY - 3.5)}" width="${n1(trackW)}" height="7" rx="3.5" fill="#FFFFFF" fill-opacity="0.14"/>`,
    )
    if (fill > 0) {
      out.push(
        `<rect x="${n1(trackX)}" y="${n1(dotY - 3.5)}" width="${n1(Math.max(7, fill))}" height="7" rx="3.5" fill="url(#br${uid})" data-progress="${(progress ?? 0).toFixed(4)}"/>`,
      )
    }
  }
  return {
    svg: out.join(''),
    date,
    word: view.word,
    period,
    bar: { track: trackW, fill },
    cells: [LEFT.x, CENTRE.x, RIGHTCOL.x],
  }
}

// ─── Fond ────────────────────────────────────────────────────────────────────

const LEAVES = [
  { x: 900, y: 236, angle: -158, length: 270, opacity: 0.16 },
  { x: 896, y: 196, angle: -134, length: 215, opacity: 0.13 },
  { x: 890, y: 268, angle: -178, length: 220, opacity: 0.1 },
  { x: 870, y: 150, angle: -112, length: 140, opacity: 0.11 },
] as const

function defs(ctx: Ctx, fontCss: string | null): string {
  const { t, uid, view } = ctx
  const tone = t.tones[view.tone]
  return `${fontCss ? `<style>${fontCss}</style>` : ''}<radialGradient id="bg${uid}" cx="${PHOTO.cx}" cy="${PHOTO.cy}" r="760" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${t.bgGlow}"/><stop offset="0.42" stop-color="${t.bgMid}"/><stop offset="1" stop-color="${t.bgDeep}"/>
    </radialGradient>
    <radialGradient id="tr${uid}" cx="820" cy="150" r="300" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${t.green}" stop-opacity="0.34"/><stop offset="1" stop-color="${t.green}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="pg${uid}"><stop offset="0.6" stop-color="${t.accentLight}" stop-opacity="0.5"/><stop offset="1" stop-color="${t.accentLight}" stop-opacity="0"/></radialGradient>
    <linearGradient id="bd${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.bandTop}"/><stop offset="1" stop-color="${t.bandBottom}"/></linearGradient>
    <linearGradient id="wv${uid}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${t.greenLight}" stop-opacity="0.95"/><stop offset="0.3" stop-color="${t.green}" stop-opacity="0.55"/><stop offset="0.62" stop-color="${t.green}" stop-opacity="0.3"/><stop offset="1" stop-color="${t.greenLight}" stop-opacity="0.95"/>
    </linearGradient>
    <linearGradient id="rg${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.accentLight}"/><stop offset="0.55" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.accentDark}"/></linearGradient>
    <linearGradient id="gl${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="${t.glassAlpha + 0.03}"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="${t.glassAlpha}"/></linearGradient>
    <linearGradient id="br${uid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${tone.barFrom}"/><stop offset="1" stop-color="${tone.barTo}"/></linearGradient>
    <filter id="bl${uid}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="sg${uid}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 -0.2126 -0.7152 -0.0722 0 1" result="ink"/><feComposite in="ink" in2="SourceAlpha" operator="in"/></filter>`
}

function background(ctx: Ctx, shift: number): string {
  const { t, uid } = ctx
  return `<rect x="${-BLEED}" y="${-BLEED}" width="${TRIM_W + BLEED * 2}" height="${TRIM_H + BLEED * 2}" fill="url(#bg${uid})"/>
  <rect x="${-BLEED}" y="${-BLEED}" width="${TRIM_W + BLEED * 2}" height="${TRIM_H + BLEED * 2}" fill="url(#tr${uid})"/>
  ${leafWatermark(LEAVES, t.greenLight, t.greenLight)}
  <path d="${swooshPath(shift)}" fill="url(#wv${uid})"/>
  <path d="${bandPath(shift)}" fill="url(#bd${uid})"/>`
}

/** Superposition de mise au point : colonnes, gouttières, marges, lignes d'alignement. */
function gridOverlay(rows: number[]): string {
  const c = '#FF2BD6'
  const cols = [LEFT, CENTRE, RIGHTCOL]
    .map(
      (col) =>
        `<rect x="${col.x}" y="0" width="${col.w}" height="${TRIM_H}" fill="${c}" fill-opacity="0.07"/>`,
    )
    .join('')
  const vx = [SAFE, LEFT.x + LEFT.w, CENTRE.x, CENTRE_END, RIGHTCOL.x, RIGHT]
  const v = vx.map((x) => `<path d="M${x} 0V${TRIM_H}"/>`).join('')
  const h = [SAFE, TRIM_H - SAFE, ...rows].map((y) => `<path d="M0 ${n1(y)}H${TRIM_W}"/>`).join('')
  return `<g data-debug="grid">${cols}<g stroke="${c}" stroke-width="0.8" fill="none">${v}${h}</g></g>`
}

// ─── Assemblage ──────────────────────────────────────────────────────────────

type Rect = { x: number; y: number; w: number; h: number }

/** Textes et géométrie de la carte tels que posés, pour les contrôles (tests, revue). */
export interface CardLayoutReport {
  title: string[]
  issuer: string[]
  name: string[]
  number: string[]
  /** Organisation du membre, puis union le cas échéant. */
  lineage: { label: string; lines: string[] }[]
  tiles: { label: string; lines: string[] }[]
  status: StatusView
  qr: CardQrInfo
  footer: { date: string; word: string; period: string; bar: { track: number; fill: number } }
  /** Panneau du QR, en unités de carte. */
  panel: Rect
  /** Cadrage de la photo ; `lowResolution` : agrandie à l'impression (< 300 ppp). */
  photo: (PhotoFrame & { lowResolution: boolean }) | null
  /** Géométrie d'alignement (unités de carte). */
  geometry: {
    nameX: number
    lineageX: number
    tiles: Rect[]
    signatureY: number
    footerRule: number
    footerCells: number[]
    titleX: number
    badgeRight: number
  }
}

function withResolution(frame: PhotoFrame): PhotoFrame & { lowResolution: boolean } {
  return { ...frame, lowResolution: frame.ppi !== null && frame.ppi < PHOTO_MIN_PPI }
}

function build(schema: CardSchema, opts: CardRenderOptions) {
  const ctx = makeCtx(schema, opts)
  const head = header(ctx)
  const shift = Math.max(0, head.bottom - HEADER_BOTTOM_BASE)
  const left = leftColumn(ctx)
  const qrModules = chooseQr(cardVerifyUrl({ cardNumber: schema.member.cardNumber })).matrix.length
  const mid = middle(ctx, head.bottom, panelMinHeight(qrModules))
  const plan = panelPlan(schema, mid.dataTop, mid.dataHeight)
  const foot = footer(ctx)
  const fontCss =
    opts.fontCss === undefined
      ? cardFontFaceCss((file) => `${CARD_FONT_PUBLIC_PATH}${file}`)
      : opts.fontCss
  const body = `${background(ctx, shift)}
  ${head.svg}
  ${portrait(ctx)}
  ${left.svg}
  ${mid.svg}
  ${qrPanel(ctx, plan)}
  ${foot.svg}${
    opts.debugGrid
      ? gridOverlay([
          mid.dataTop,
          GRID.dataBottom,
          GRID.footerRule,
          NAME_CAP_TOP + shift,
          head.bottom,
        ])
      : ''
  }`
  const report: CardLayoutReport = {
    title: head.title,
    issuer: head.issuer,
    name: mid.name,
    number: left.number,
    lineage: mid.lineage,
    tiles: mid.tiles,
    status: ctx.view,
    qr: qrInfo(plan),
    footer: { date: foot.date, word: foot.word, period: foot.period, bar: foot.bar },
    panel: { x: RIGHTCOL.x, y: plan.top, w: RIGHTCOL.w, h: plan.height },
    photo: ctx.photo ? withResolution(photoFrame(imageSizeFromDataUrl(ctx.photo))) : null,
    geometry: {
      nameX: CENTRE.x,
      lineageX: mid.lineageX,
      tiles: mid.tileRects,
      signatureY: left.signatureY,
      footerRule: GRID.footerRule,
      footerCells: foot.cells,
      titleX: head.titleX,
      badgeRight: RIGHT,
    },
  }
  return { ctx, defs: defs(ctx, fontCss), body, report }
}

/** Mise en page de la carte sans rendu : textes posés, QR, jauge, géométrie. */
export function cardLayout(schema: CardSchema, opts: CardRenderOptions = {}): CardLayoutReport {
  return build(schema, opts).report
}

/** Géométrie imprimée du QR : sert aux contrôles de lisibilité (tests, revue d'impression). */
export function describeCardQr(schema: CardSchema, opts: CardRenderOptions = {}): CardQrInfo {
  return build(schema, opts).report.qr
}

/** SVG de la carte (face unique). Même dessin pour l'aperçu, le PNG, le PDF et la feuille A4. */
export function renderCardSvg(schema: CardSchema, opts: CardRenderOptions = {}): string {
  const { mode = 'screen', intrinsicSize = false } = opts
  const { ctx, defs: d, body } = build(schema, opts)
  const { uid } = ctx
  const bleed = opts.bleed ?? mode === 'print'
  const rounded = mode === 'screen'
  const vb = bleed
    ? `${-BLEED} ${-BLEED} ${TRIM_W + BLEED * 2} ${TRIM_H + BLEED * 2}`
    : `0 0 ${TRIM_W} ${TRIM_H}`
  const size = bleed ? [TRIM_W + BLEED * 2, TRIM_H + BLEED * 2] : [TRIM_W, TRIM_H]
  const dims = intrinsicSize ? ` width="${size[0]}" height="${size[1]}"` : ''
  const clip = rounded
    ? `<clipPath id="tm${uid}"><rect x="0" y="0" width="${TRIM_W}" height="${TRIM_H}" rx="${CORNER_RADIUS}"/></clipPath>`
    : ''
  const open = rounded ? `<g clip-path="url(#tm${uid})">` : '<g>'
  const ariaLabel = `${headerTitle(schema)}, ${fullName(schema)}`

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vb}"${dims} role="img" aria-label="${esc(ariaLabel)}">
  <defs>${d}${clip}</defs>
  ${open}
  ${body}
  </g>
</svg>`
}
