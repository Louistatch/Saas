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
    /** Membership level: 'or' | 'argent' | 'bronze' */
    level?: 'or' | 'argent' | 'bronze'
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
  /**
   * Template-driven labels and theme (edited by the cooperative admin).
   * The renderer reads these so the editor actually changes the output.
   */
  template?: {
    /** Card title, e.g. "CARTE DE MEMBRE" */
    title: string
    /** Card subtitle, e.g. "Pass d'accès coopératif" */
    subtitle: string
    /** Base background color (drives the gradient) */
    bgColor: string
    /** Accent color (badges, rings, highlights) */
    accentColor?: string
    /** Text color on the dark side */
    textColor: string
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
  level?: 'or' | 'argent' | 'bronze'
  template?: {
    title: string
    subtitle: string
    bgColor: string
    accentColor?: string
    textColor: string
  }
}): CardSchema {
  const locality = [
    opts.member.village,
    opts.member.canton,
    opts.member.prefecture,
    opts.member.region,
  ].filter(Boolean).join(', ')

  // Derive the gradient from the template background color so editing it has
  // a real visual effect, while keeping a tasteful 3-stop depth.
  const base = opts.template?.bgColor ?? '#0d3d22'
  const gradient = deriveGradient(base)
  const accent = opts.accentColor ?? lighten(base, 0.45)

  return {
    version: 1,
    canvas: { width: 1600, height: 1000 },
    background: {
      type: 'gradient',
      gradient,
    },
    branding: {
      faitiereName: opts.faitiereName,
      cooperativeName: opts.cooperativeName,
      accentColor: accent,
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
      level: opts.level ?? 'bronze',
    },
    styles: {
      accentColor: accent,
      textColor: opts.template?.textColor ?? opts.textColor ?? '#ffffff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      borderRadius: 16,
    },
    template: opts.template,
  }
}

// ─── Color helpers (drive the theme from a single base color) ────────────────

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')
}

/** Lighten a hex color toward white by amount 0..1 */
export function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount)
}

/** Darken a hex color toward black by amount 0..1 */
export function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount))
}

/** Build a 3-stop radial gradient from a single base color. */
function deriveGradient(base: string): { offset: number; color: string }[] {
  return [
    { offset: 0, color: lighten(base, 0.18) },
    { offset: 0.45, color: base },
    { offset: 0.78, color: darken(base, 0.35) },
    { offset: 1, color: darken(base, 0.62) },
  ]
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
