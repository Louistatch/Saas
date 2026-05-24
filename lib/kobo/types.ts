/**
 * KoboCollect Integration — Type definitions
 * All types for the Kobo pipeline: submissions, sync, field mappings, stats.
 * Strict TypeScript — zero `any`.
 */

// =========================================================
// Database row types (matching the SQL migration)
// =========================================================

export type KoboSubmissionStatus =
  | 'pending'
  | 'processing'
  | 'matched'
  | 'unmatched'
  | 'error'
  | 'duplicate'

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
  _submitted_by?: string
  _attachments?: KoboAttachment[]
  _version_?: string
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
  since?: Date
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
}

export interface RetryResult {
  total: number
  retried: number
  succeeded: number
  failed: number
  errors: Array<{ instanceId: string; error: string }>
}

export interface TestConnectionResult {
  valid: boolean
  formTitle?: string
  submissionCount?: number
  error?: string
}

// =========================================================
// API request/response types
// =========================================================

export interface KoboConfigInput {
  cooperativeId: string
  apiToken: string
  formId: string
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
  webhookEnabled: boolean
  status: string
  lastSyncAt: string | null
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
  _submitted_by?: string
  formhub?: { uuid: string }
  [key: string]: unknown
}

export interface KoboWebhookResponse {
  received: boolean
  submission_id?: string
  status?: KoboSubmissionStatus | 'duplicate'
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
