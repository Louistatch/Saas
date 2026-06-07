/**
 * Zod validation schemas for the KoboCollect integration module.
 * Covers: webhook payloads, API inputs, query params, field mappings, sync requests.
 *
 * Every external input touching the Kobo pipeline MUST pass through one of these schemas.
 */
import { z } from 'zod'

// =========================================================
// Shared primitives
// =========================================================

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export const uuidParam = z.string().regex(UUID_RE, 'Invalid UUID format')

export const cooperativeIdParam = uuidParam.describe('cooperative_id')

// =========================================================
// Webhook payload (KoboToolbox → FaîtiereHub)
// =========================================================

/**
 * Validates the incoming KoboToolbox webhook payload.
 * Uses .passthrough() because KoboCollect adds dynamic fields per XLSForm.
 */
export const koboWebhookPayloadSchema = z
  .object({
    _uuid: z.string().min(1, 'Missing _uuid'),
    _id: z.number().int().positive(),
    _xform_id_string: z.string().min(1, 'Missing _xform_id_string'),
    _submission_time: z.string().min(1, 'Missing _submission_time'),
    _submitted_by: z.string().optional(),
    _version_: z.string().optional(),
    _attachments: z
      .array(
        z.object({
          download_url: z.string().url(),
          filename: z.string(),
          mimetype: z.string().optional(),
          id: z.number().optional(),
        }),
      )
      .optional(),
    formhub: z
      .object({
        uuid: z.string(),
      })
      .optional(),
  })
  .passthrough()

export type KoboWebhookPayloadInput = z.infer<typeof koboWebhookPayloadSchema>

// =========================================================
// Kobo configuration (POST /api/integrations/kobo)
// =========================================================

export const koboFieldMappingSchema = z.object({
  koboField: z.string().min(1).max(200),
  targetTable: z.enum(['members', 'parcelles', 'productions', 'cotisations']),
  targetColumn: z.string().min(1).max(100),
  transformFn: z.enum(['uppercase', 'trim', 'to_number', 'to_date']).optional(),
  isKeyField: z.boolean().default(false),
})

export const koboConfigSchema = z.object({
  cooperativeId: uuidParam,
  // Optional — omit to keep the cooperative's already-saved (encrypted) token.
  apiToken: z.string().min(40, 'API token trop court').max(200).optional(),
  formId: z.string().min(5, 'Form ID trop court').max(100),
  webhookEnabled: z.boolean().default(true),
  fieldMappings: z.array(koboFieldMappingSchema).max(50).optional(),
})

export type KoboConfigInput = z.infer<typeof koboConfigSchema>

// =========================================================
// Kobo config update (PATCH — partial update)
// =========================================================

export const koboConfigUpdateSchema = z.object({
  cooperativeId: uuidParam,
  apiToken: z.string().min(40).max(200).optional(),
  formId: z.string().min(5).max(100).optional(),
  webhookEnabled: z.boolean().optional(),
  fieldMappings: z.array(koboFieldMappingSchema).max(50).optional(),
})

export type KoboConfigUpdateInput = z.infer<typeof koboConfigUpdateSchema>

// =========================================================
// Sync request (POST /api/integrations/kobo/sync)
// =========================================================

export const koboSyncRequestSchema = z.object({
  cooperativeId: uuidParam,
  mode: z.enum(['full', 'incremental']),
})

export type KoboSyncRequestInput = z.infer<typeof koboSyncRequestSchema>

// =========================================================
// Query params: GET /api/integrations/kobo?cooperativeId=...
// =========================================================

export const koboConfigQuerySchema = z.object({
  cooperativeId: uuidParam,
})

// =========================================================
// Query params: GET /api/integrations/kobo/stats?cooperativeId=...
// =========================================================

export const koboStatsQuerySchema = z.object({
  cooperativeId: uuidParam,
})

// =========================================================
// Query params: submissions list (pagination + filters)
// =========================================================

export const koboSubmissionsQuerySchema = z.object({
  cooperativeId: uuidParam,
  page: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(1000))
    .default('1'),
  pageSize: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(100))
    .default('25'),
  status: z
    .enum(['pending', 'processing', 'matched', 'unmatched', 'error', 'duplicate'])
    .optional(),
  search: z.string().max(100).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
})

export type KoboSubmissionsQueryInput = z.infer<typeof koboSubmissionsQuerySchema>

// =========================================================
// SSE progress query params
// =========================================================

export const koboSyncProgressQuerySchema = z.object({
  syncLogId: uuidParam,
})

// =========================================================
// Delete query params
// =========================================================

export const koboDeleteQuerySchema = z.object({
  cooperativeId: uuidParam,
})

// =========================================================
// Retry request
// =========================================================

export const koboRetryRequestSchema = z.object({
  cooperativeId: uuidParam,
  submissionId: uuidParam.optional(),
})

export type KoboRetryRequestInput = z.infer<typeof koboRetryRequestSchema>

// =========================================================
// Webhook signature header validation
// =========================================================

export const koboWebhookHeadersSchema = z.object({
  'x-kobotoolbox-signature': z.string().min(1).optional(),
  'x-kobo-secret': z.string().min(1).optional(),
  authorization: z.string().min(1).optional(),
  'content-type': z.string().refine(
    (ct) => ct.includes('application/json'),
    'Content-Type must be application/json',
  ),
  'content-length': z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().max(2_097_152, 'Payload exceeds 2MB limit'))
    .optional(),
})

// =========================================================
// Card number format (for matching)
// =========================================================

export const cardNumberSchema = z
  .string()
  .regex(/^[A-Z]{2,5}-\d{4,6}$/, 'Format carte invalide (ex: FEN-001234)')

// =========================================================
// Test connection request
// =========================================================

export const koboTestConnectionSchema = z.object({
  cooperativeId: uuidParam,
  apiToken: z.string().min(40).max(200),
  formId: z.string().min(5).max(100),
})

// Variant used by the "Tester la connexion" button: apiToken is optional —
// when omitted, the server decrypts and tests the cooperative's already-saved
// token, so testing never requires re-entering (or risks overwriting) it.
export const koboTestConnectionRequestSchema = z.object({
  cooperativeId: uuidParam,
  apiToken: z.string().min(40).max(200).optional(),
  formId: z.string().min(5).max(100),
})

export type KoboTestConnectionRequestInput = z.infer<typeof koboTestConnectionRequestSchema>

export type KoboTestConnectionInput = z.infer<typeof koboTestConnectionSchema>

// =========================================================
// Cooperative name (enrollment) — SEC-03
// Validated and ILIKE-escaped before any DB lookup.
// =========================================================

/**
 * Validates a cooperative name coming from an untrusted KoboCollect payload.
 * Length-bounded and trimmed. Does NOT escape — call escapeIlike() before
 * interpolating into an .ilike() pattern.
 */
export const cooperativeNameSchema = z
  .string()
  .trim()
  .min(2, 'Nom de coopérative trop court')
  .max(100, 'Nom de coopérative trop long')

/**
 * Escapes PostgreSQL ILIKE wildcards (%, _, \) so user input cannot widen
 * the match. Use for the SEARCH TERM, then wrap with your own %...% bounds.
 *
 *   const safe = escapeIlike(parsed)        // "a_b%" -> "a\_b\%"
 *   .ilike('name', `%${safe}%`)
 */
export function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}
