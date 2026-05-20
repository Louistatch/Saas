/**
 * Card Schema — Single Source of Truth
 * 
 * Every card is defined by this JSON schema.
 * The renderer reads ONLY this schema to produce the output.
 * Preview === Export === Print (pixel-perfect).
 */

export interface CardSchema {
  /** Schema version for future migrations */
  version: 1
  /** Canvas dimensions */
  canvas: {
    width: number
    height: number
  }
  /** Background configuration */
  background: {
    type: 'gradient' | 'solid' | 'image'
    /** Gradient stops: [{ offset: 0-1, color: hex }] */
    gradient?: { offset: number; color: string }[]
    /** Solid color */
    color?: string
    /** Background image URL */
    imageUrl?: string
  }
  /** Branding */
  branding: {
    faitiereName: string
    cooperativeName: string
    logoUrl?: string
    accentColor: string
  }
  /** Member data (filled at generation time) */
  member: {
    firstName: string
    lastName: string
    phone: string
    photoUrl: string | null
    locality: string
    cardNumber: string
    expiryDate: string
    createdAt: string
  }
  /** Visual style overrides */
  styles: {
    /** Primary accent color (badges, highlights) */
    accentColor: string
    /** Text color on dark background */
    textColor: string
    /** Font family */
    fontFamily: string
    /** Border radius for cards/blocks */
    borderRadius: number
  }
}

/**
 * Build a CardSchema from the existing data model.
 * This is the bridge between the old system and the new schema-based renderer.
 */
export function buildCardSchema(opts: {
  member: {
    first_name: string
    last_name: string
    phone?: string | null
    photo_url?: string | null
    village?: string | null
    canton?: string | null
    prefecture?: string | null
    region?: string | null
  }
  cardNumber: string
  expiryDate: string | null
  createdAt: string
  cooperativeName: string
  faitiereName: string
  accentColor?: string
  textColor?: string
}): CardSchema {
  const locality = [
    opts.member.village,
    opts.member.canton,
    opts.member.prefecture,
    opts.member.region,
  ].filter(Boolean).join(', ')

  return {
    version: 1,
    canvas: { width: 1600, height: 1000 },
    background: {
      type: 'gradient',
      gradient: [
        { offset: 0, color: '#0a2e1a' },
        { offset: 0.4, color: '#0d3d22' },
        { offset: 1, color: '#061a0f' },
      ],
    },
    branding: {
      faitiereName: opts.faitiereName,
      cooperativeName: opts.cooperativeName,
      accentColor: opts.accentColor ?? '#1ed760',
    },
    member: {
      firstName: opts.member.first_name ?? '',
      lastName: opts.member.last_name ?? '',
      phone: opts.member.phone ?? '',
      photoUrl: opts.member.photo_url ?? null,
      locality,
      cardNumber: opts.cardNumber,
      expiryDate: opts.expiryDate ?? '',
      createdAt: opts.createdAt,
    },
    styles: {
      accentColor: opts.accentColor ?? '#1ed760',
      textColor: opts.textColor ?? '#ffffff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      borderRadius: 16,
    },
  }
}

/** Default schema for preview purposes */
export const PREVIEW_SCHEMA: CardSchema = buildCardSchema({
  member: {
    first_name: 'Ama',
    last_name: 'KOFFI',
    phone: '+228 90 12 34 56',
    photo_url: null,
    village: 'Agbélouvé',
    canton: 'Zio',
    prefecture: 'Zio',
    region: 'Maritime',
  },
  cardNumber: 'HAR-12345',
  expiryDate: '2027-05-20',
  createdAt: '2026-05-20',
  cooperativeName: 'HAROFEMA',
  faitiereName: 'FENOMAT',
})
