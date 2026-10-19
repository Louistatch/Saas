/**
 * Enregistrement d'une soumission reçue (webhook OU pull) dans kobo_submissions.
 *
 * Déduplication sur l'identité STABLE de la soumission (meta/rootUuid, sinon _uuid ; voir
 * lib/kobo/payload.ts), toujours bornée à la coopérative de l'intégration (l'unicité en base est
 * (kobo_instance_id, cooperative_id)). Avant, la clé était `_uuid`, qui change à chaque
 * modification dans Enketo : une soumission corrigée était réimportée et réinscrite.
 *
 * Une version MODIFIÉE (même identité, `_uuid` différent) met à jour la ligne existante et la
 * remet en file ('pending') au lieu de créer une seconde ligne, donc un second membre.
 *
 * Aucune colonne nouvelle : valable avant comme après les migrations.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { EDITABLE_STATUSES } from './claim'
import { koboSubmissionIdentity } from './payload'

type Db = SupabaseClient

export type RegisterOutcome =
  | { kind: 'created'; id: string }
  /** Version modifiée d'une soumission connue : ligne mise à jour et remise en file. */
  | { kind: 'edited'; id: string }
  | { kind: 'duplicate'; id: string }
  /** Modification reçue pendant le traitement de la ligne : reprise à la prochaine synchronisation. */
  | { kind: 'busy'; id: string }
  | { kind: 'error'; code?: string; message: string }

export interface RegisterArgs {
  cooperativeId: string
  formId: string
  payload: Record<string, unknown>
  submittedAt: string
  memberCardNumber: string | null
}

interface ExistingRow {
  id: string
  status: string
  payloadUuid: string | null
}

async function findExisting(
  db: Db,
  cooperativeId: string,
  candidates: string[],
  key: string,
): Promise<{ row: ExistingRow | null; error?: string }> {
  const read = async (select: string) =>
    db
      .from('kobo_submissions')
      .select(select)
      .eq('cooperative_id', cooperativeId)
      .in('kobo_instance_id', candidates)
      .limit(5)

  // Lecture légère : seul le `_uuid` de la version stockée est utile pour reconnaître une modification.
  let res = await read('id, status, kobo_instance_id, payload_uuid:raw_payload->>_uuid')
  if (res.error) res = await read('id, status, kobo_instance_id, raw_payload')
  if (res.error) return { row: null, error: res.error.message }

  const rows = (res.data ?? []) as unknown as Array<Record<string, unknown>>
  // Ligne de la clé courante d'abord, sinon la première (clé héritée d'une version modifiée).
  const hit = rows.find((r) => r.kobo_instance_id === key) ?? rows[0]
  if (!hit) return { row: null }
  const stored =
    (typeof hit.payload_uuid === 'string' ? hit.payload_uuid : null) ??
    ((hit.raw_payload as Record<string, unknown> | null | undefined)?._uuid as
      | string
      | undefined) ??
    null
  return { row: { id: String(hit.id), status: String(hit.status), payloadUuid: stored } }
}

export async function registerSubmission(db: Db, args: RegisterArgs): Promise<RegisterOutcome> {
  const identity = koboSubmissionIdentity(args.payload)
  if (!identity.key) return { kind: 'error', message: 'Soumission sans identifiant (_uuid / _id)' }

  const lookup = await findExisting(db, args.cooperativeId, identity.candidates, identity.key)
  if (lookup.error) return { kind: 'error', message: lookup.error }

  if (lookup.row) return reconcileExisting(db, args, lookup.row, identity.versionUuid)

  const { data: inserted, error } = await db
    .from('kobo_submissions')
    .insert({
      cooperative_id: args.cooperativeId,
      kobo_instance_id: identity.key,
      kobo_form_id: args.formId,
      raw_payload: args.payload,
      member_card_number: args.memberCardNumber,
      status: 'pending',
      submitted_at: args.submittedAt,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    // 23505 : livraison concurrente (webhook ou autre pull) — l'autre requête a gagné.
    if (error?.code === '23505') {
      const winner = await findExisting(db, args.cooperativeId, identity.candidates, identity.key)
      return { kind: 'duplicate', id: winner.row?.id ?? '' }
    }
    return { kind: 'error', code: error?.code, message: error?.message ?? 'Insert failed' }
  }
  return { kind: 'created', id: inserted.id as string }
}

async function reconcileExisting(
  db: Db,
  args: RegisterArgs,
  row: ExistingRow,
  versionUuid: string | null,
): Promise<RegisterOutcome> {
  // Même version (ou version stockée inconnue) : simple doublon.
  if (!versionUuid || !row.payloadUuid || row.payloadUuid === versionUuid) {
    return { kind: 'duplicate', id: row.id }
  }

  const { data, error } = await db
    .from('kobo_submissions')
    .update({
      raw_payload: args.payload,
      // Le numéro déjà émis pour ce membre n'est pas effacé par une version qui n'en porte pas.
      ...(args.memberCardNumber ? { member_card_number: args.memberCardNumber } : {}),
      status: 'pending',
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    // Jamais pendant un traitement : le traitement en cours verrait un contenu qui change sous ses pieds.
    .in('status', [...EDITABLE_STATUSES])
    .select('id')
  if (error) return { kind: 'error', code: error.code, message: error.message }
  return (data ?? []).length > 0 ? { kind: 'edited', id: row.id } : { kind: 'busy', id: row.id }
}
