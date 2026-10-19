/**
 * KoboCollect Integration — Type definitions
 * All types for the Kobo pipeline: submissions, sync, field mappings, stats.
 * Strict TypeScript — zero `any`.
 */

// =========================================================
// Database row types (matching the SQL migration)
// =========================================================

/**
 * Source de vérité des statuts d'une soumission : partagée par le type TS, le
 * validateur Zod, l'interface et le CHECK SQL (migration 20261010_100000).
 * « Traitée » = 'matched' + processed_at/processed_payload (pas de statut
 * 'processed' : il n'existe ni dans les stats ni dans l'interface).
 */
export const KOBO_SUBMISSION_STATUSES = [
  'pending',
  'processing',
  'matched',
  'unmatched',
  'error',
  'duplicate',
] as const

export type KoboSubmissionStatus = (typeof KOBO_SUBMISSION_STATUSES)[number]

/**
 * Type de formulaire Kobo configuré sur l'intégration (config.form_type) :
 * il pilote le traitement de chaque soumission. 'member_enrollment' est le
 * comportement par défaut (inscription / mise à jour d'un membre).
 */
export const KOBO_FORM_TYPES = [
  'member_enrollment',
  'cooperative_registration',
  'harvest',
  'plot_survey',
  'market_price',
] as const

export type KoboFormType = (typeof KOBO_FORM_TYPES)[number]

export const KOBO_FORM_TYPE_LABELS: Record<KoboFormType, string> = {
  member_enrollment: 'Inscription / mise à jour de membres',
  cooperative_registration: 'Inscription de coopératives',
  harvest: 'Récoltes (productions)',
  plot_survey: 'Relevé de parcelles',
  market_price: 'Prix de marché',
}

/** Codes d'erreur de l'API KoboToolbox, mappés en messages français (lib/kobo/api-client.ts). */
export type KoboErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'rate_limited'
  | 'server_error'
  | 'network'
  | 'timeout'
  | 'redirect'
  | 'invalid_response'
  | 'invalid_token'
  | 'unsafe_host'
  | 'not_deployed'

/** Échec GLOBAL d'un pull (authentification, permission, réseau…) : jamais un « succès à 0 reçue ». */
export interface KoboFatalError {
  code: KoboErrorCode
  message: string
  status?: number
  retryAfterSec?: number
}

export type KoboSyncType = 'webhook' | 'pull' | 'manual'

export type KoboSyncLogStatus = 'started' | 'success' | 'partial' | 'failed'

export type KoboTransformFn = 'uppercase' | 'trim' | 'to_number' | 'to_date'

export type KoboTargetTable = 'members' | 'parcelles' | 'productions' | 'cotisations'

export interface KoboSubmissionRow {
  id: string
  cooperative_id: string
  member_id: string | null
  kobo_instance_id: string
  kobo_form_id: string
  raw_payload: Record<string, unknown>
  processed_payload: Record<string, unknown> | null
  member_card_number: string | null
  status: KoboSubmissionStatus
  error_message: string | null
  matched_at: string | null
  processed_at: string | null
  submitted_at: string
  created_at: string
  updated_at: string
}

export interface KoboSyncLogRow {
  id: string
  cooperative_id: string
  integration_id: string | null
  sync_type: KoboSyncType
  status: KoboSyncLogStatus
  submissions_received: number
  submissions_processed: number
  submissions_matched: number
  submissions_errors: number
  duration_ms: number | null
  error_details: Record<string, unknown> | null
  triggered_by: string | null
  started_at: string
  completed_at: string | null
}

export interface KoboFieldMappingRow {
  id: string
  cooperative_id: string
  form_id: string
  kobo_field: string
  target_table: string
  target_column: string
  transform_fn: string | null
  is_key_field: boolean
  created_at: string
}

// =========================================================
// KoboToolbox API response types
// =========================================================

export interface KoboAttachment {
  download_url: string
  download_small_url?: string
  filename: string
  mimetype?: string
  id?: number
}

export interface KoboApiSubmission {
  _id: number
  _uuid: string
  _xform_id_string: string
  _submission_time: string
  // Kobo renvoie `null` pour les envois anonymes (cas majoritaire en production).
  _submitted_by?: string | null
  _attachments?: KoboAttachment[]
  _version_?: string | null
  _status?: string
  formhub?: { uuid: string }
  [key: string]: unknown
}

export interface KoboApiDataResponse {
  count: number
  next: string | null
  previous: string | null
  results: KoboApiSubmission[]
}

export interface KoboFormField {
  name: string
  type: string
  label?: string | Record<string, string>
  group?: string
  required?: boolean
  choices?: Array<{ name: string; label: string | Record<string, string> }>
}

export interface KoboFormGroup {
  name: string
  label?: string | Record<string, string>
  fields: KoboFormField[]
  repeat?: boolean
}

export interface KoboFormStructure {
  fields: KoboFormField[]
  groups: KoboFormGroup[]
}

export interface KoboAssetInfo {
  uid: string
  name: string
  deployment_status: string
  submission_count: number
  date_created: string
  date_modified: string
}

// =========================================================
// Sync service types
// =========================================================

export interface SyncOptions {
  cooperativeId: string
  formId: string
  apiToken: string
  /** Origine du serveur Kobo (https://kf.kobotoolbox.org par défaut). */
  serverUrl?: string
  /** config.form_type de l'intégration : pilote le traitement de chaque soumission. */
  formType?: string | null
  integrationId?: string | null
  triggeredBy?: string | null
  /** Sync incrémentale : ne relit que les soumissions depuis cette date (marge déjà appliquée). */
  since?: Date
  /** Reprise : ne lit que les soumissions dont l'_id est strictement supérieur. */
  cursor?: number | null
  /** Budget temps de l'appel, en ms (défaut 40 s) : au-delà, arrêt propre avec curseur. */
  budgetMs?: number
  onProgress?: (current: number, total: number) => void
}

export interface SyncResult {
  success: boolean
  syncLogId: string
  received: number
  processed: number
  matched: number
  unmatched: number
  errors: number
  duration: number
  errorDetails?: Array<{ instanceId: string; error: string }>
  /** Soumissions déjà connues (non retraitées) : distinct de « traitées ». */
  skipped?: number
  /** Vrai si le budget temps a interrompu le pull : rappeler avec `cursor`. */
  partial?: boolean
  /** Dernier _id entièrement traité (à renvoyer pour reprendre). */
  cursor?: number | null
  /** Estimation des soumissions restantes (champ `count` de Kobo), si connue. */
  remaining?: number | null
  /** Plus grande _submission_time des soumissions enregistrées pendant ce run. */
  watermark?: string | null
  /** Soumissions reçues mais non enregistrées en base (le curseur incrémental ne doit pas avancer). */
  unpersisted?: number
  /** Échec global : le pull n'a pas pu se faire (token, permission, formulaire, réseau). */
  fatal?: KoboFatalError
}

export interface RetryResult {
  total: number
  retried: number
  succeeded: number
  failed: number
  /** Lignes prises en charge par un autre traitement au même moment : ni succès ni échec. */
  skipped?: number
  errors: Array<{ instanceId: string; error: string }>
}

export interface TestConnectionResult {
  valid: boolean
  formTitle?: string
  submissionCount?: number
  error?: string
  code?: KoboErrorCode
  /** 'deployed' | 'draft' | 'archived' | '-' (champ deployment_status de KPI). */
  deploymentStatus?: string
  /** Vrai si /data/ répond : le compte du token a la permission « Voir les soumissions ». */
  canViewSubmissions?: boolean
  /** Avertissement non bloquant (formulaire archivé : plus de nouvelles soumissions). */
  warning?: string
}

// =========================================================
// API request/response types
// =========================================================

export interface KoboConfigInput {
  cooperativeId: string
  apiToken: string
  formId: string
  serverUrl?: string
  formType?: KoboFormType
  webhookEnabled: boolean
  fieldMappings?: KoboFieldMappingInput[]
}

export interface KoboFieldMappingInput {
  koboField: string
  targetTable: KoboTargetTable
  targetColumn: string
  transformFn?: KoboTransformFn
  isKeyField: boolean
}

export interface KoboConfigResponse {
  cooperativeId: string
  formId: string
  /** Origine du serveur Kobo configuré (https://kf.kobotoolbox.org par défaut). */
  serverUrl: string
  formType: KoboFormType
  webhookEnabled: boolean
  /** URL dédiée de l'intégration (/api/webhooks/kobo?integration=<id>), sans secret. */
  webhookUrl: string | null
  /** Vrai si un secret de webhook propre à l'intégration existe (jamais affiché : seul son hash est stocké). */
  webhookSecretConfigured: boolean
  status: string
  lastSyncAt: string | null
  /** Masque fixe : ni le token, ni sa version chiffrée, ni ses derniers caractères ne sont renvoyés. */
  apiTokenMasked: string
  fieldMappings: KoboFieldMappingRow[]
}

export interface KoboStatsResponse {
  total: number
  pending: number
  processing: number
  matched: number
  unmatched: number
  errors: number
  duplicates: number
  lastSync: string | null
}

export interface KoboSyncRequest {
  cooperativeId: string
  mode: 'full' | 'incremental'
  /** Reprise d'une sync interrompue par le budget temps (valeur renvoyée par l'appel précédent). */
  cursor?: number
}

// =========================================================
// SSE progress types
// =========================================================

export interface KoboSyncProgressEvent {
  type: 'progress'
  current: number
  total: number
  status: 'processing'
}

export interface KoboSyncCompleteEvent {
  type: 'complete'
  result: SyncResult
}

export interface KoboSyncErrorEvent {
  type: 'error'
  message: string
}

export type KoboSyncSSEEvent =
  | KoboSyncProgressEvent
  | KoboSyncCompleteEvent
  | KoboSyncErrorEvent

// =========================================================
// Webhook types
// =========================================================

export interface KoboWebhookPayload {
  _uuid: string
  _id: number
  _xform_id_string: string
  _submission_time: string
  _submitted_by?: string | null
  formhub?: { uuid: string }
  [key: string]: unknown
}

export interface KoboWebhookResponse {
  received: boolean
  submission_id?: string
  /** 'disabled' : webhook coupé par l'admin (réponse 200, rien n'est stocké). */
  status?: KoboSubmissionStatus | 'disabled'
  message?: string
}

// =========================================================
// UI / Hook types (client-side)
// =========================================================

export interface UseKoboStatsReturn {
  stats: KoboStatsResponse | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export interface UseKoboSyncReturn {
  isSyncing: boolean
  progress: { current: number; total: number } | null
  result: SyncResult | null
  error: string | null
  startSync: (mode: 'full' | 'incremental') => void
  cancelSync: () => void
}

export interface UseKoboSubmissionsOptions {
  cooperativeId: string
  page: number
  pageSize: number
  status?: KoboSubmissionStatus
  search?: string
  dateFrom?: string
  dateTo?: string
}

export interface UseKoboSubmissionsReturn {
  submissions: KoboSubmissionRow[]
  totalCount: number
  isLoading: boolean
  error: string | null
  refetch: () => void
}

// =========================================================
// Field mapping UI types
// =========================================================

export interface FieldMappingOption {
  value: string
  label: string
  group?: string
}

export interface KoboFormFieldForMapping {
  path: string
  label: string
  type: string
  group?: string
}
