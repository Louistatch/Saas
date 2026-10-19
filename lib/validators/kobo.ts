/**
 * Zod validation schemas for the KoboCollect integration module.
 * Covers: webhook payloads, API inputs, query params, field mappings, sync requests.
 *
 * Every external input touching the Kobo pipeline MUST pass through one of these schemas.
 */
import { z } from 'zod'
import { parseKoboFormInput } from '../kobo/form-id'
import { mappingTargetError } from '../kobo/mapping-targets'
import { KOBO_SERVER_PRESETS, parseKoboServerUrl } from '../kobo/server-url'
import { KOBO_FORM_TYPES, KOBO_SUBMISSION_STATUSES } from '../kobo/types'

// =========================================================
// Shared primitives
// =========================================================

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export const uuidParam = z.string().regex(UUID_RE, 'Invalid UUID format')

export const cooperativeIdParam = uuidParam.describe('cooperative_id')

/**
 * Token API KoboToolbox : clé DRF de 40 caractères hexadécimaux.
 * Normalisé AVANT tout usage (espaces, retour à la ligne collé, préfixe « Token »
 * recopié depuis la doc) : un token mal formé ne doit jamais atteindre un en-tête HTTP,
 * ni être recopié dans un message d'erreur.
 */
export const koboApiTokenSchema = z
  .string()
  .max(300, 'Token KoboToolbox invalide (40 caractères hexadécimaux)')
  .transform((v) => v.trim().replace(/^Token\s+/i, '').trim())
  .pipe(z.string().regex(/^[0-9a-f]{40}$/i, 'Token KoboToolbox invalide (40 caractères hexadécimaux)'))

/** Types de formulaire (config.form_type) — voir lib/kobo/types.ts. */
export const koboFormTypeSchema = z.enum(KOBO_FORM_TYPES)

/**
 * Normalise la cible Kobo saisie par l'admin : Form ID collé tel quel ou sous forme d'URL de
 * projet (uid extrait, serveur déduit), serveur choisi dans la liste ou saisi (https obligatoire,
 * jamais d'IP/localhost). Renvoie le Form ID propre et, si connu, l'origine du serveur.
 */
export function resolveKoboTarget(
  rawFormId: string,
  rawServerUrl?: string | null,
): { ok: true; formId: string; serverUrl?: string } | { ok: false; field: 'formId' | 'serverUrl'; error: string } {
  const form = parseKoboFormInput(rawFormId)
  if (!form.ok) return { ok: false, field: 'formId', error: form.error }

  let explicit: string | undefined
  const rawServer = rawServerUrl?.trim()
  if (rawServer) {
    const preset = KOBO_SERVER_PRESETS[rawServer as keyof typeof KOBO_SERVER_PRESETS]
    const server = preset ? { ok: true as const, origin: preset.origin } : parseKoboServerUrl(rawServer)
    if (!server.ok) return { ok: false, field: 'serverUrl', error: server.error }
    explicit = server.origin
  }
  if (explicit && form.serverUrl && explicit !== form.serverUrl) {
    return {
      ok: false,
      field: 'serverUrl',
      error: "Le serveur de l'adresse collée ne correspond pas au serveur sélectionné.",
    }
  }
  return { ok: true, formId: form.formId, serverUrl: explicit ?? form.serverUrl }
}

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
    // Kobo renvoie `_submitted_by: null` pour les envois anonymes : c'est le cas majoritaire,
    // le rejeter faisait perdre la soumission (réponse 200, rien stocké).
    _submitted_by: z.string().nullish(),
    _version_: z.string().nullish(),
    // .passthrough() : question_xpath et uid servent à retrouver la photo/signature ;
    // sans lui Zod les supprime du payload stocké. L'URL est contrôlée au téléchargement
    // (lib/kobo/attachment-url.ts), pas ici : une pièce jointe supprimée peut avoir une URL vide.
    _attachments: z
      .array(
        z
          .object({
            download_url: z.string().optional().nullable(),
            filename: z.string().optional().nullable(),
            mimetype: z.string().optional().nullable(),
            id: z.number().optional(),
          })
          .passthrough(),
      )
      .nullish(),
    formhub: z
      .object({
        uuid: z.string(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough()

export type KoboWebhookPayloadInput = z.infer<typeof koboWebhookPayloadSchema>

// =========================================================
// Kobo configuration (POST /api/integrations/kobo)
// =========================================================

export const koboFieldMappingSchema = z
  .object({
    koboField: z.string().min(1).max(200),
    targetTable: z.enum(['members', 'parcelles', 'productions', 'cotisations']),
    // Identifiant SQL simple : la colonne cible n'est jamais interpolée telle quelle dans une requête.
    targetColumn: z
      .string()
      .min(1)
      .max(63)
      .regex(/^[a-z_][a-z0-9_]*$/, 'Nom de colonne invalide (minuscules, chiffres et _)'),
    transformFn: z.enum(['uppercase', 'trim', 'to_number', 'to_date']).optional(),
    isKeyField: z.boolean().default(false),
  })
  // Liste blanche : seules les cibles que le pipeline applique vraiment sont acceptées
  // (lib/kobo/mapping-targets.ts) — l'éditeur ne promet plus de mappage inexistant.
  .superRefine((m, ctx) => {
    const error = mappingTargetError(m.targetTable, m.targetColumn, m.isKeyField)
    if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetColumn'], message: error })
  })

/** Valide le couple Form ID / serveur et remplace formId par l'uid normalisé. */
function normalizeTarget<T extends { formId: string; serverUrl?: string }>(
  data: T,
  ctx: z.RefinementCtx,
): T {
  const target = resolveKoboTarget(data.formId, data.serverUrl)
  if (!target.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [target.field], message: target.error })
    return z.NEVER
  }
  return { ...data, formId: target.formId, serverUrl: target.serverUrl }
}

export const koboConfigSchema = z
  .object({
    cooperativeId: uuidParam,
    // Optionnel — omis = conserver le token chiffré déjà enregistré.
    apiToken: koboApiTokenSchema.optional(),
    // Uid du formulaire OU URL du projet (l'uid et le serveur en sont extraits).
    formId: z.string().max(500),
    // Origine du serveur (« global », « eu » ou https://… auto-hébergé). Omis = serveur déjà
    // configuré, ou Global pour une première configuration.
    serverUrl: z.string().max(300).optional(),
    // Omis = conserver le type déjà configuré (le réenregistrement ne doit jamais l'effacer).
    formType: koboFormTypeSchema.optional(),
    // Omis = conserver la valeur actuelle.
    webhookEnabled: z.boolean().optional(),
    // Omis = ne pas toucher aux correspondances ; [] = les supprimer toutes.
    fieldMappings: z.array(koboFieldMappingSchema).max(50).optional(),
  })
  .transform(normalizeTarget)

export type KoboConfigInput = z.infer<typeof koboConfigSchema>

// =========================================================
// Kobo config update (PATCH — partial update)
// =========================================================

export const koboConfigUpdateSchema = z.object({
  cooperativeId: uuidParam,
  apiToken: koboApiTokenSchema.optional(),
  formId: z.string().max(500).optional(),
  serverUrl: z.string().max(300).optional(),
  formType: koboFormTypeSchema.optional(),
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
  // Reprise d'une sync interrompue par le budget temps : dernier _id traité (renvoyé par l'appel précédent).
  cursor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
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
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().min(1).max(1000))
    .default('1'),
  pageSize: z
    .string()
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().min(1).max(100))
    .default('25'),
  status: z.enum(KOBO_SUBMISSION_STATUSES).optional(),
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
  // KoboToolbox ne signe jamais ses requêtes : le secret voyage dans un en-tête personnalisé,
  // en Basic Auth ou en Bearer (voir lib/kobo/webhook-auth.ts).
  'x-kobo-secret': z.string().min(1).optional(),
  authorization: z.string().min(1).optional(),
  'content-type': z.string().refine(
    (ct) => ct.includes('application/json'),
    'Content-Type must be application/json',
  ),
  'content-length': z
    .string()
    .transform((v) => Number.parseInt(v, 10))
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

export const koboTestConnectionSchema = z
  .object({
    cooperativeId: uuidParam,
    apiToken: koboApiTokenSchema,
    formId: z.string().max(500),
    serverUrl: z.string().max(300).optional(),
  })
  .transform(normalizeTarget)

// Variant used by the "Tester la connexion" button: apiToken is optional —
// when omitted, the server decrypts and tests the cooperative's already-saved
// token, so testing never requires re-entering (or risks overwriting) it.
export const koboTestConnectionRequestSchema = z
  .object({
    cooperativeId: uuidParam,
    apiToken: koboApiTokenSchema.optional(),
    formId: z.string().max(500),
    serverUrl: z.string().max(300).optional(),
  })
  .transform(normalizeTarget)

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
