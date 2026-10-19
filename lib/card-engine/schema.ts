/**
 * Schéma de la carte de membre — source unique de vérité.
 *
 * Le rendu ne lit que ce schéma : aperçu, PNG, PDF et feuille imprimée sont le
 * même dessin. Aucune valeur d'exemple n'est codée ici : tout vient des
 * données de la carte, du membre et de l'organisation.
 */

export type CardLevel = 'or' | 'argent' | 'bronze'
export type OrgLevel = 'faitiere' | 'union' | 'cooperative'
export type CardStatusKey = 'active' | 'pending' | 'expired' | 'revoked' | 'suspended'

/** Intitulés par défaut quand l'organisation n'a pas enregistré de modèle. */
export const DEFAULT_CARD_TITLE = "Carte d'identité membre"
export const DEFAULT_CARD_SUBTITLE = "Pass d'accès coopératif"

export interface CardSchema {
  version: 2
  branding: {
    /** Identifiant de l'organisation du membre (suffixe des identifiants du SVG). */
    organisationId: string | null
    /** Rang de l'organisation du membre, pour libeller son champ. */
    organisationLevel: OrgLevel
    cooperativeName: string
    cooperativeLogoUrl: string | null
    /** Largeur / hauteur du logo, mesurée à sa résolution. */
    cooperativeLogoAspect: number | null
    unionName: string | null
    /** Autorité émettrice : tête de la lignée. `null` : le registre FaîtiereHub. */
    faitiereName: string | null
    faitiereLogoUrl: string | null
    faitiereLogoAspect: number | null
    /** Couleur principale de l'organisation : accent secondaire (anneau, pastilles), jamais du texte. */
    brandColor: string | null
    /** Couleur d'accent du modèle : repli quand la couleur principale manque. */
    accentColor: string | null
  }
  member: {
    firstName: string
    lastName: string
    phone: string
    photoUrl: string | null
    /** Signature réelle du membre (image) ; `null` : ligne de signature vierge. */
    signatureUrl: string | null
    locality: string
    cardNumber: string
    /** `AAAA-MM-JJ` (ou horodatage ISO) tel que stocké ; jamais passé par Date. */
    expiryDate: string
    createdAt: string
    /** Niveau réel (get_member_score) ; `null` quand il n'est pas connu. */
    level: CardLevel | null
    status: CardStatusKey
  }
  /** Libellés du modèle (modifiables par l'administrateur). */
  template: {
    title: string
    subtitle: string
  }
}

export interface BuildCardSchemaOptions {
  member: {
    first_name: string
    last_name: string
    phone?: string | null
    photo_url?: string | null
    signature_url?: string | null
    village?: string | null
    canton?: string | null
    prefecture?: string | null
    region?: string | null
  }
  cardNumber: string
  expiryDate: string | null
  createdAt: string | null
  status?: string | null
  cooperativeName: string
  organisationId?: string | null
  organisationLevel?: string | null
  unionName?: string | null
  faitiereName?: string | null
  faitiereLogoUrl?: string | null
  cooperativeLogoUrl?: string | null
  faitiereLogoAspect?: number | null
  cooperativeLogoAspect?: number | null
  /** Couleur principale ; à défaut, `template.bgColor`. */
  brandColor?: string | null
  /** Couleur d'accent ; à défaut, `template.accentColor`. */
  accentColor?: string | null
  level?: CardLevel | null
  template?: {
    title?: string | null
    subtitle?: string | null
    bgColor?: string | null
    accentColor?: string | null
    /** Hérité du modèle d'origine ; ignoré (les couleurs du texte sont fixes). */
    textColor?: string | null
  } | null
}

const STATUS_KEYS: ReadonlySet<string> = new Set([
  'active',
  'pending',
  'expired',
  'revoked',
  'suspended',
])

function orgLevel(value: string | null | undefined): OrgLevel {
  return value === 'faitiere' || value === 'union' ? value : 'cooperative'
}

function nonEmpty(value: string | null | undefined): string | null {
  const v = value?.trim()
  return v ? v : null
}

/** Localité : village, canton, préfecture, région, sans répétition d'un même nom. */
export function joinLocality(parts: (string | null | undefined)[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const v = part?.trim()
    if (!v) continue
    const key = v.toLocaleLowerCase('fr')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out.join(', ')
}

/** Construit le schéma de rendu à partir du modèle de données existant. */
export function buildCardSchema(opts: BuildCardSchemaOptions): CardSchema {
  const status =
    opts.status && STATUS_KEYS.has(opts.status) ? (opts.status as CardStatusKey) : 'active'
  return {
    version: 2,
    branding: {
      organisationId: opts.organisationId ?? null,
      organisationLevel: orgLevel(opts.organisationLevel),
      cooperativeName: opts.cooperativeName.trim(),
      cooperativeLogoUrl: opts.cooperativeLogoUrl ?? null,
      cooperativeLogoAspect: opts.cooperativeLogoAspect ?? null,
      unionName: nonEmpty(opts.unionName),
      faitiereName: nonEmpty(opts.faitiereName),
      faitiereLogoUrl: opts.faitiereLogoUrl ?? null,
      faitiereLogoAspect: opts.faitiereLogoAspect ?? null,
      brandColor: opts.brandColor ?? opts.template?.bgColor ?? null,
      accentColor: opts.accentColor ?? opts.template?.accentColor ?? null,
    },
    member: {
      firstName: (opts.member.first_name ?? '').trim(),
      lastName: (opts.member.last_name ?? '').trim(),
      phone: (opts.member.phone ?? '').trim(),
      photoUrl: opts.member.photo_url ?? null,
      signatureUrl: nonEmpty(opts.member.signature_url),
      locality: joinLocality([
        opts.member.village,
        opts.member.canton,
        opts.member.prefecture,
        opts.member.region,
      ]),
      cardNumber: opts.cardNumber,
      expiryDate: opts.expiryDate ?? '',
      createdAt: opts.createdAt ?? '',
      level: opts.level ?? null,
      status,
    },
    template: {
      title: nonEmpty(opts.template?.title) ?? DEFAULT_CARD_TITLE,
      subtitle: nonEmpty(opts.template?.subtitle) ?? DEFAULT_CARD_SUBTITLE,
    },
  }
}

// ─── Aides couleur (partagées avec la carte Haroo) ───────────────────────────

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`
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
