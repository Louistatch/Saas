/**
 * Marché de proximité et travail agricole : règles partagées par l'API et les écrans.
 *
 * Tout ce qui se calcule sans base (expiration d'une annonce, montants, sacs, regroupement
 * par proximité, validation de la publication) vit ici pour être testé seul
 * (tests/market-work.test.ts). Les décisions — répondre, inviter, retenir — appartiennent aux
 * fonctions SQL de supabase/migrations/20261023_150000_market_work.sql.
 */
import { z } from 'zod'

export type AnnouncementType = 'job' | 'prevente' | 'mission' | 'autre'
export const ANNOUNCEMENT_TYPE_VALUES = ['job', 'prevente', 'mission', 'autre'] as const

/** 0 = même canton, 1 = même préfecture, 2 = même région, 3 = ailleurs. */
export type ProximityRank = 0 | 1 | 2 | 3

/** Une annonce telle que la liste publique la sert : jamais de téléphone ni d'auteur. */
export interface MarketAnnouncement {
  id: string
  type: AnnouncementType
  title: string
  description: string | null
  culture: string | null
  quantity_kg: number | null
  price_per_kg_fcfa: number | null
  wage_per_day_fcfa: number | null
  positions: number | null
  starts_on: string | null
  work_days: number | null
  /** Un numéro peut être demandé (« Afficher le numéro »). */
  has_contact: boolean
  /** L'annonce a un auteur connecté : on peut lui répondre depuis le site. */
  accepts_responses: boolean
  /** Annonce du compte qui regarde (pas de bouton « Je suis intéressé »). */
  mine: boolean
  created_at: string
  expires_at: string | null
  canton: string | null
  prefecture: string | null
  region: string | null
  proximity: ProximityRank
}

export const TYPE_LABEL: Record<AnnouncementType, string> = {
  prevente: 'Récolte à vendre',
  job: 'Offre de travail',
  mission: 'Mission de conseil',
  autre: 'Service',
}

/** Le verbe du bouton de réponse, selon ce qu'on propose. */
export const RESPOND_LABEL: Record<AnnouncementType, string> = {
  prevente: 'Je suis intéressé',
  job: 'Je suis disponible',
  mission: 'Proposer mes services',
  autre: 'Je suis intéressé',
}

export const PROXIMITY_LABEL: Record<ProximityRank, string> = {
  0: 'Dans votre canton',
  1: 'Dans votre préfecture',
  2: 'Dans votre région',
  3: 'Ailleurs au Togo',
}

const DAY = 86_400_000

/** Une date AAAA-MM-JJ lue à midi UTC, pour qu'aucun fuseau ne la décale d'un jour. */
function dayStart(iso: string): number {
  return Date.parse(`${iso}T12:00:00Z`)
}

/**
 * Date d'expiration d'une nouvelle annonce : une offre de travail se ferme deux jours après le
 * dernier jour de travail, une prévente 30 jours après la récolte, le reste au bout de 45 jours.
 * Toujours entre 3 jours et 6 mois à partir de maintenant.
 */
export function expiryFor(
  input: { type: AnnouncementType; starts_on?: string | null; work_days?: number | null },
  now = Date.now(),
): string {
  let at = now + 45 * DAY
  if (input.type === 'job') {
    at = input.starts_on
      ? dayStart(input.starts_on) + ((input.work_days ?? 1) + 2) * DAY
      : now + 30 * DAY
  } else if (input.type === 'prevente') {
    at = (input.starts_on ? dayStart(input.starts_on) : now) + 30 * DAY
  }
  const bounded = Math.min(Math.max(at, now + 3 * DAY), now + 183 * DAY)
  return new Date(bounded).toISOString()
}

/** Une annonce encore ouverte (la base garde aussi les annonces sans date d'expiration). */
export function isOpen(expiresAt: string | null, now = Date.now()): boolean {
  return !expiresAt || Date.parse(expiresAt) > now
}

export function formatFcfa(value: number): string {
  return `${Math.round(value).toLocaleString('fr-FR')} FCFA`
}

/** « 2 000 kg », et « 20 sacs » quand c'est un compte rond de sacs de 100 kg. */
export function formatQuantity(kg: number): string {
  const base = `${Math.round(kg).toLocaleString('fr-FR')} kg`
  if (kg >= 100 && kg % 100 === 0) {
    const bags = kg / 100
    return `${base} · ${bags.toLocaleString('fr-FR')} sac${bags > 1 ? 's' : ''}`
  }
  return base
}

/** Saisie en sacs de 100 kg ou en kilos : la base garde toujours des kilos. */
export const BAG_KG = 100
export function toKg(value: number, unit: 'kg' | 'sac'): number {
  return unit === 'sac' ? value * BAG_KG : value
}

/** « Lun. 3 nov. · 2 jours » pour une offre de travail. */
export function formatWorkDates(startsOn: string | null, workDays: number | null): string | null {
  if (!startsOn && !workDays) return null
  const parts: string[] = []
  if (startsOn) {
    parts.push(
      new Date(dayStart(startsOn)).toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }),
    )
  }
  if (workDays) parts.push(`${workDays} jour${workDays > 1 ? 's' : ''}`)
  return parts.join(' · ')
}

/** Paie totale d'une offre de travail par ouvrier (salaire × jours), si elle se calcule. */
export function totalPay(wage: number | null, workDays: number | null): number | null {
  return wage && workDays ? wage * workDays : null
}

/** Les annonces groupées par proximité, dans l'ordre, sans groupe vide. */
export function groupByProximity<T extends { proximity: ProximityRank }>(
  items: T[],
): { rank: ProximityRank; label: string; items: T[] }[] {
  return ([0, 1, 2, 3] as const)
    .map((rank) => ({
      rank,
      label: PROXIMITY_LABEL[rank],
      items: items.filter((item) => item.proximity === rank),
    }))
    .filter((group) => group.items.length > 0)
}

/** « +228 90 11 22 33 » : un numéro togolais lisible ; tout autre numéro reste tel quel. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const local =
    digits.length === 8
      ? digits
      : digits.startsWith('228') && digits.length === 11
        ? digits.slice(3)
        : null
  return local ? `+228 ${local.replace(/(\d{2})(?=\d)/g, '$1 ')}` : phone
}

/** Lien WhatsApp : wa.me veut des chiffres seulement, indicatif compris. */
export function whatsappLink(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, '')
  const full = digits.length === 8 ? `228${digits}` : digits
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T12:00:00Z`)), 'Date invalide')

/** Ce que l'on peut publier. Une offre de travail porte toujours un salaire par jour. */
export const publishSchema = z
  .object({
    type: z.enum(ANNOUNCEMENT_TYPE_VALUES),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000).optional(),
    culture: z.string().trim().max(80).optional(),
    quantity_kg: z.number().positive().max(10_000_000).optional(),
    price_per_kg_fcfa: z.number().positive().max(10_000_000).optional(),
    wage_per_day_fcfa: z.number().int().min(100).max(100_000).optional(),
    positions: z.number().int().min(1).max(200).optional(),
    starts_on: isoDate.optional(),
    work_days: z.number().int().min(1).max(120).optional(),
    contact_phone: z.string().trim().max(30).optional(),
    canton_id: z.string().uuid().optional(),
    prefecture_id: z.string().uuid().optional(),
    region_id: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'job' && !value.wage_per_day_fcfa) {
      ctx.addIssue({
        code: 'custom',
        path: ['wage_per_day_fcfa'],
        message: 'Indiquez le salaire par jour',
      })
    }
  })

export type PublishInput = z.infer<typeof publishSchema>

/**
 * Les champs qui ont un sens pour le type publié : une offre de travail n'a pas de prix au
 * kilo, une récolte pas de salaire. Évite qu'un formulaire mal rempli mélange les deux.
 */
export function fieldsForType(input: PublishInput) {
  const job = input.type === 'job'
  return {
    culture: input.culture ?? null,
    quantity_kg: job ? null : (input.quantity_kg ?? null),
    price_per_kg_fcfa: job ? null : (input.price_per_kg_fcfa ?? null),
    wage_per_day_fcfa: job ? (input.wage_per_day_fcfa ?? null) : null,
    positions: job ? (input.positions ?? 1) : null,
    starts_on: input.type === 'job' || input.type === 'prevente' ? (input.starts_on ?? null) : null,
    work_days: job ? (input.work_days ?? null) : null,
  }
}
