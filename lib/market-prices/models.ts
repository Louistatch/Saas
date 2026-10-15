/**
 * Object-oriented domain models for the "Prix du marché" feature.
 * Wrapping raw API rows in small classes keeps display logic
 * (emoji, labels, trend formatting) colocated with the data it describes.
 */

export const REGIONS_DATA = [
  { id: 'b0f3fef0-032d-4566-9b97-89d9efcbe23b', name: 'Maritime', emoji: '🌊' },
  { id: '913db44f-9095-4ee0-8574-8ecbfad47a4a', name: 'Plateaux', emoji: '🏔️' },
  { id: '1fba6fc3-28e8-48f7-bf3e-774fce7bd9f0', name: 'Centrale', emoji: '🌾' },
  { id: 'e7becd6d-4f6e-4cb9-9f4d-f70d736800b1', name: 'Kara', emoji: '☀️' },
  { id: '801137e4-e990-4dc7-83f6-db4d9b41c42d', name: 'Savanes', emoji: '🌿' },
] as const

export const CULTURES_DATA = [
  { id: '90b9f0cf-c879-4ac4-b3f7-98c5f2e712b7', name: 'Tomate', emoji: '🍅' },
  { id: 'c2891f71-e3d8-4f08-b5ac-992bce1ddff4', name: 'Oignon', emoji: '🧅' },
  { id: '3cb519af-7572-499e-ab58-83655f05825a', name: 'Piment', emoji: '🌶️' },
  { id: '478432bd-83c8-4923-8aa2-ceb686c0bc1e', name: 'Gombo', emoji: '🥒' },
] as const

const FALLBACK_CULTURE_EMOJIS: Array<[string, string]> = [
  ['gari', '🥣'], ['haricot', '🫘'], ['sorgho', '🌾'], ['mil', '🌾'], ['maïs', '🌽'], ['mais', '🌽'], ['riz', '🌾'], ['manioc', '🥔'], ['igname', '🍠'],
  ['soja', '🫘'], ['arachide', '🥜'], ['coton', '🌿'], ['cacao', '🍫'],
  ['café', '☕'], ['cafe', '☕'], ['banane', '🍌'], ['ananas', '🍍'],
  ['papaye', '🍈'], ['piment', '🌶️'], ['tomate', '🍅'], ['oignon', '🧅'], ['gombo', '🥒'],
]

export class Region {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly emoji: string,
  ) {}

  static all(): Region[] {
    return REGIONS_DATA.map((r) => new Region(r.id, r.name, r.emoji))
  }

  static findByName(name: string | null | undefined): Region | undefined {
    if (!name) return undefined
    return Region.all().find((r) => r.name === name)
  }

  static findById(id: string | null | undefined): Region | undefined {
    if (!id) return undefined
    return Region.all().find((r) => r.id === id)
  }
}

export class Culture {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly emoji: string,
  ) {}

  static all(): Culture[] {
    return CULTURES_DATA.map((c) => new Culture(c.id, c.name, c.emoji))
  }

  static findById(id: string | null | undefined): Culture | undefined {
    if (!id) return undefined
    return Culture.all().find((c) => c.id === id)
  }

  /** Resolves an emoji for an arbitrary culture name, falling back to a heuristic guess. */
  static emojiForName(name: string | null | undefined): string {
    const known = Culture.all().find((c) => c.name.toLowerCase() === (name ?? '').toLowerCase())
    if (known) return known.emoji
    const lower = (name ?? '').toLowerCase()
    for (const [needle, emoji] of FALLBACK_CULTURE_EMOJIS) {
      if (lower.includes(needle)) return emoji
    }
    return '🌱'
  }
}

export interface LocationOption {
  id: string
  name: string
  priceCount?: number
}

export type PriceTrend = 'up' | 'down' | 'stable'

/**
 * Valeurs écrites par le pipeline d'ingestion CPC d'AgriTogo
 * (app/ingestion/cpc.py) : le CPC publie séparément le prix de gros et le prix
 * de détail. Sans cette dimension, `market_prices` porte DEUX lignes par
 * culture et par marché, et un tableau qui les mélange affiche deux prix
 * contradictoires pour le même maïs au même endroit.
 */
export type PriceType = 'wholesale' | 'retail' | 'unknown'

export interface MarketPriceRow {
  id: string
  culture_id: string
  market_name: string
  price: number
  trend: string
  verified: boolean
  created_at: string
  /** Absent tant que la migration CPC n'est pas appliquée — d'où l'optionalité. */
  price_type?: string | null
  /** 'manual' (saisie sur la plateforme) ou le code d'une source externe, ex. 'SIM-CPC'. */
  source?: string | null
  cultures: { name: string } | null
  // Ligne de la vue `market_price_current` : un prix par culture ET par région.
  regions?: { name: string } | null
  region_name?: string | null
  scope?: string | null
  scope_name?: string | null
  markets?: string[] | null
  sources?: string[] | null
  n_markets?: number | null
  n_obs?: number | null
  price_min?: number | null
  price_max?: number | null
  previous_price?: number | null
  change_pct?: number | null
  trend_known?: boolean | null
  history?: number[] | null
}

/**
 * Wraps a raw market price row with display-ready accessors
 * (resolved culture name/emoji, trend label, formatted price).
 */
export class MarketPrice {
  constructor(private readonly row: MarketPriceRow) {}

  get id(): string {
    return this.row.id
  }

  get cultureId(): string {
    return this.row.culture_id
  }

  get cultureName(): string {
    return Culture.findById(this.row.culture_id)?.name ?? this.row.cultures?.name ?? '—'
  }

  get cultureEmoji(): string {
    return Culture.findById(this.row.culture_id)?.emoji ?? Culture.emojiForName(this.row.cultures?.name)
  }

  get marketName(): string {
    return this.row.market_name
  }

  get price(): number {
    return this.row.price
  }

  get formattedPrice(): string {
    return `${this.row.price.toLocaleString('fr-FR')} F/kg`
  }

  get trend(): PriceTrend {
    return (this.row.trend as PriceTrend) ?? 'stable'
  }

  get priceType(): PriceType {
    const t = this.row.price_type
    return t === 'wholesale' || t === 'retail' ? t : 'unknown'
  }

  /**
   * Libellé destiné à un producteur, pas à un économiste. « Gros » est le prix
   * auquel il VEND sa récolte ; « Détail » celui que paie le consommateur au
   * marché. Les deux sont utiles, mais les confondre fait croire à une marge
   * qui n'existe pas.
   */
  get priceTypeLabel(): string {
    if (this.priceType === 'wholesale') return 'Gros'
    if (this.priceType === 'retail') return 'Détail'
    return ''
  }

  /** Âge du relevé, en jours. */
  get ageDays(): number {
    const t = Date.parse(this.row.created_at)
    if (Number.isNaN(t)) return Number.POSITIVE_INFINITY
    return Math.floor((Date.now() - t) / 86_400_000)
  }

  /**
   * Un prix agricole vieux de plus de deux semaines n'est plus un prix, c'est
   * un souvenir. Le tableau les affichait sans aucune date sous une tuile
   * intitulée « Cours live » : un producteur pouvait brader sa récolte sur un
   * relevé vieux de quatre mois sans jamais savoir qu'il était périmé.
   */
  get isStale(): boolean {
    return this.ageDays > 14
  }

  /** Ancienneté en clair, pour quelqu'un qui ne lit pas une date ISO. */
  get freshnessLabel(): string {
    const d = this.ageDays
    if (!Number.isFinite(d)) return 'date inconnue'
    if (d <= 0) return "aujourd'hui"
    if (d === 1) return 'hier'
    if (d < 7) return `il y a ${d} jours`
    if (d < 31) return `il y a ${Math.floor(d / 7)} semaine${d >= 14 ? 's' : ''}`
    const months = Math.floor(d / 30)
    return `il y a ${months} mois`
  }

  get trendLabel(): string {
    if (this.trend === 'up') return '↑ Hausse'
    if (this.trend === 'down') return '↓ Baisse'
    return '→ Stable'
  }

  private get externalSource(): string | null {
    const all = [...(this.row.sources ?? []), ...(this.row.source ? [this.row.source] : [])]
    return all.find((code) => code && code !== 'manual') ?? null
  }

  /** Relevé issu d'une source externe (pas saisi sur la plateforme). */
  get isExternal(): boolean {
    return this.externalSource !== null
  }

  /** « CPC » pour SIM-CPC : le producteur doit savoir d'où vient le chiffre. */
  get sourceLabel(): string {
    const code = this.externalSource ?? ''
    return code.startsWith('SIM-') ? code.slice(4) : code
  }

  /** Nom de la région du prix (« Kara »), jamais deviné côté écran. */
  get regionName(): string {
    return this.row.region_name ?? this.row.regions?.name ?? ''
  }

  /** Zone du prix : « Kara », « Binah » ou « Kétao » selon la maille choisie. */
  get scopeName(): string {
    return this.row.scope_name ?? this.regionName
  }

  /** Nombre de marchés dont le prix est la médiane. */
  get marketCount(): number {
    return this.row.n_markets ?? (this.row.market_name ? 1 : 0)
  }

  get priceRange(): { min: number; max: number } | null {
    const { price_min: min, price_max: max } = this.row
    return min != null && max != null && min !== max ? { min, max } : null
  }

  /** Variation par rapport à la période précédente, en %. `null` s'il n'y en a pas. */
  get changePct(): number | null {
    return this.row.trend_known ? (this.row.change_pct ?? null) : null
  }

  get trendKnown(): boolean {
    return this.row.trend_known === true
  }

  /** Médianes hebdomadaires, de la plus ancienne à la plus récente. */
  get history(): number[] {
    return this.row.history ?? []
  }

  get verified(): boolean {
    return this.row.verified
  }

  get createdAt(): string {
    return this.row.created_at
  }

  static fromRows(rows: MarketPriceRow[]): MarketPrice[] {
    return rows.map((row) => new MarketPrice(row))
  }

  /** Groups prices by culture, sorted chronologically — used to build sparklines. */
  static groupValuesByCulture(prices: MarketPrice[]): Record<string, number[]> {
    const groups: Record<string, number[]> = {}
    const sorted = [...prices].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    for (const p of sorted) {
      if (!groups[p.cultureId]) groups[p.cultureId] = []
      groups[p.cultureId].push(p.price)
    }
    return groups
  }
}
