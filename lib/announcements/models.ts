/**
 * Object-oriented domain models for producer-side announcements
 * (job offers, pre-sales, other Haroo-related posts) created
 * inline from "Mon Exploitation" in the card-verification flow.
 */

export type AnnouncementType = 'job' | 'prevente' | 'autre'

export const ANNOUNCEMENT_TYPES: Array<{ id: AnnouncementType; label: string; emoji: string; description: string }> = [
  { id: 'job', label: "Offre d'emploi", emoji: '👷', description: 'Recruter pour vos travaux agricoles' },
  { id: 'prevente', label: 'Prévente', emoji: '🌾', description: 'Annoncer une récolte avant maturité' },
  { id: 'autre', label: 'Autre annonce', emoji: '📣', description: 'Tout autre besoin lié à Haroo' },
]

export interface AnnouncementRow {
  id: string
  type: AnnouncementType
  title: string
  description: string | null
  culture: string | null
  quantity_kg: number | null
  price_per_kg_fcfa: number | null
  location_canton: string | null
  contact_phone: string | null
  status: string
  created_at: string
}

/** Wraps a raw announcement row with display-ready accessors (emoji, label, formatted fields). */
export class Announcement {
  constructor(private readonly row: AnnouncementRow) {}

  get id(): string {
    return this.row.id
  }

  get type(): AnnouncementType {
    return this.row.type
  }

  get typeInfo() {
    return ANNOUNCEMENT_TYPES.find((t) => t.id === this.row.type) ?? ANNOUNCEMENT_TYPES[2]
  }

  get title(): string {
    return this.row.title
  }

  get description(): string | null {
    return this.row.description
  }

  get culture(): string | null {
    return this.row.culture
  }

  get formattedQuantity(): string | null {
    return this.row.quantity_kg != null ? `${this.row.quantity_kg.toLocaleString('fr-FR')} kg` : null
  }

  get formattedPrice(): string | null {
    return this.row.price_per_kg_fcfa != null
      ? `${this.row.price_per_kg_fcfa.toLocaleString('fr-FR')} FCFA/kg`
      : null
  }

  get locationCanton(): string | null {
    return this.row.location_canton
  }

  get contactPhone(): string | null {
    return this.row.contact_phone
  }

  get status(): string {
    return this.row.status
  }

  get statusLabel(): string {
    if (this.row.status === 'closed') return 'Clôturée'
    if (this.row.status === 'expired') return 'Expirée'
    return 'Active'
  }

  get createdAt(): string {
    return this.row.created_at
  }

  static fromRows(rows: AnnouncementRow[]): Announcement[] {
    return rows.map((row) => new Announcement(row))
  }
}
