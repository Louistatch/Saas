import { calculateEnterpriseBudget } from '@/lib/agronomy/enterprise-budget'
import { z } from 'zod'

export const DOCUMENT_PRICE_XOF = 1500
export const BUCKET = 'ceit-documents'
export const MAX_PDF_BYTES = 2 * 1024 * 1024
export const keySchema = z.string().regex(/^[a-z0-9_-]{2,60}$/)
const text = (min: number, max: number) => z.string().trim().min(min).max(max)
const number = (max: number) => z.number().finite().nonnegative().max(max)
const uuid = z.string().uuid()
export const productSchema = z
  .object({
    owner_kind: z.enum(['faitiere', 'operator', 'platform']),
    faitiere_id: uuid.nullable().default(null),
    operator_id: uuid.nullable().default(null),
    title: text(3, 160),
    culture: keySchema,
    skills: z.array(keySchema).min(1).max(12),
    region_id: uuid.nullable().default(null),
    prefecture_id: uuid.nullable().default(null),
    canton_id: uuid.nullable().default(null),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      (v.owner_kind === 'faitiere' && (!v.faitiere_id || v.operator_id)) ||
      (v.owner_kind === 'operator' && (!v.operator_id || v.faitiere_id)) ||
      (v.owner_kind === 'platform' && (v.faitiere_id || v.operator_id))
    )
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Propriétaire incohérent' })
  })
export const versionSchema = z
  .object({
    context: text(20, 3000),
    areaHa: z.number().finite().positive().max(10000),
    costs: z
      .array(
        z
          .object({
            id: keySchema,
            label: text(2, 120),
            category: z.enum([
              'land',
              'seed',
              'fertilizer',
              'crop_protection',
              'labour',
              'mechanization',
              'harvest',
              'post_harvest',
              'transport',
              'other',
            ]),
            quantity: number(1e9),
            unitPrice: number(1e9),
            scaling: z.enum(['per_hectare', 'per_farm', 'per_tonne', 'per_kg']),
          })
          .strict(),
      )
      .min(1)
      .max(80),
    scenarios: z
      .array(
        z
          .object({
            id: keySchema,
            label: text(2, 80),
            yieldTonnesPerHa: number(200),
            salePricePerTonne: number(1e9),
            lossRatePercent: number(99.99).default(0),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    itinerary: z
      .array(
        z
          .object({
            dayStart: z.number().int().min(-365).max(1825),
            dayEnd: z.number().int().min(-365).max(1825),
            operation: text(3, 160),
            instructions: text(20, 3000),
            precautions: text(5, 1500),
          })
          .strict()
          .refine((v) => v.dayEnd >= v.dayStart, 'Fin antérieure au début'),
      )
      .min(1)
      .max(80),
    sources: z
      .array(
        z
          .object({
            title: text(3, 200),
            url: z
              .string()
              .url()
              .max(500)
              .refine((v) => v.startsWith('https://'), 'HTTPS requis'),
            rights: z.enum(['open', 'authorized']),
            checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            notes: text(5, 1000),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.costs.map((c) => c.id)).size !== v.costs.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Identifiants de charges dupliqués' })
    try {
      const values = calculateEnterpriseBudget(v)
      if (
        values.some(
          (r) =>
            !Number.isSafeInteger(Math.round(r.totalCost)) ||
            !Number.isSafeInteger(Math.round(r.revenue)),
        )
      )
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Montants hors limites' })
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Montants hors limites' })
    }
  })
export const transitionSchema = z
  .object({
    action: z.enum(['submit', 'approve', 'reject', 'publish']),
    notes: text(0, 3000).default(''),
  })
  .strict()
export const pinSchema = z
  .object({ product_id: uuid, card_number: text(5, 80), pin: z.string().regex(/^\d{6}$/) })
  .strict()
export const grantSchema = z
  .object({ grant_id: uuid, token: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict()
export const missionSchema = grantSchema.extend({
  agronome_id: uuid,
  scope: text(20, 2000),
  acknowledged: z.literal(true),
})
export const availabilitySchema = z
  .object({
    available: z.boolean(),
    cultures: z.array(keySchema).min(1).max(30),
    skills: z.array(keySchema).min(1).max(30),
    capacity: z.number().int().min(1).max(5),
  })
  .strict()
export const authorizationSchema = z
  .object({
    kind: z.enum(['operator', 'mandate', 'reviewer']),
    target: uuid,
    until: z.string().datetime(),
    faitiere: uuid.nullable().default(null),
    revoked: z.boolean().default(false),
  })
  .strict()
export const qualificationSchema = z
  .object({
    agronome_id: uuid,
    cultures: z.array(keySchema).min(1).max(30),
    skills: z.array(keySchema).min(1).max(30),
    revoked: z.boolean().default(false),
  })
  .strict()
export type VersionInput = z.infer<typeof versionSchema>
export interface CatalogueItem {
  id: string
  title: string
  culture: string
  owner_kind: 'faitiere' | 'operator' | 'platform'
  owner_name: string
  region_id: string | null
  prefecture_id: string | null
  canton_id: string | null
  version_id: string
  price: 1500
}

/** No card fee, no default digital commission, and no implicit settlement. */
export function digitalSettlement(
  amount: number,
  policy: { commissionBps: number | null; approved: boolean; payoutsEnabled: boolean },
) {
  if (amount !== DOCUMENT_PRICE_XOF) throw new Error('Montant CE/IT invalide')
  if (!policy.approved || !policy.payoutsEnabled || policy.commissionBps === null)
    return { enabled: false as const }
  if (
    !Number.isInteger(policy.commissionBps) ||
    policy.commissionBps < 0 ||
    policy.commissionBps > 10000
  )
    throw new Error('Commission invalide')
  const commission = Math.round((amount * policy.commissionBps) / 10000)
  return { enabled: true as const, commission, net: amount - commission }
}
