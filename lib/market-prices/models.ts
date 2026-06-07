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
  ['maïs', '🌽'], ['mais', '🌽'], ['riz', '🌾'], ['manioc', '🥔'], ['igname', '🍠'],
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

export interface MarketPriceRow {
  id: string
  culture_id: string
  market_name: string
  price: number
  trend: string
  verified: boolean
  created_at: string
  cultures: { name: string } | null
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

  get trendLabel(): string {
    if (this.trend === 'up') return '↑ Hausse'
    if (this.trend === 'down') return '↓ Baisse'
    return '→ Stable'
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
