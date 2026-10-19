/**
 * Lecture du payload d'une soumission Kobo — logique PURE (imports relatifs uniquement : ce
 * fichier est chargé tel quel par node:test).
 *
 * Source UNIQUE de `getPayloadField` (il existait en double : enrollment.ts et processors.ts)
 * et de l'identité STABLE d'une soumission.
 *
 * Identifiants Kobo (docs API v2, « Submission identifiers ») :
 *   - `_id`            entier stable ;
 *   - `_uuid`          change à CHAQUE modification (Enketo crée un nouvel instanceID) ;
 *   - `meta/rootUuid`  stable d'une modification à l'autre (préfixe « uuid: ») : clé de
 *                      déduplication recommandée, `_id` en repli ;
 *   - `meta/deprecatedID` instance précédente, présente seulement sur une version modifiée.
 */

/**
 * Lit un champ TEXTE d'un payload aplati par Kobo (« groupe/champ »). Chemin exact d'abord,
 * puis repli sur le nom court : un formulaire dont le groupe a été renommé reste lisible.
 */
export function getPayloadField(payload: Record<string, unknown>, path: string): string | null {
  if (path in payload && typeof payload[path] === 'string') return (payload[path] as string).trim()
  const leaf = path.split('/').pop()
  for (const [key, value] of Object.entries(payload)) {
    if (key === path && typeof value === 'string') return value.trim()
    if (key.endsWith(`/${leaf}`) && typeof value === 'string') return value.trim()
  }
  return null
}

/** « uuid:1234… » → « 1234… » ; vide ou non textuel → null. */
export function stripUuidPrefix(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value
    .trim()
    .replace(/^uuid:/i, '')
    .trim()
  return v.length > 0 ? v : null
}

function metaField(payload: Record<string, unknown>, name: string): string | null {
  const flat = stripUuidPrefix(payload[`meta/${name}`])
  if (flat) return flat
  const meta = payload.meta
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    return stripUuidPrefix((meta as Record<string, unknown>)[name])
  }
  return null
}

export interface KoboSubmissionIdentity {
  /**
   * Clé de déduplication STOCKÉE dans kobo_instance_id : meta/rootUuid, sinon _uuid, sinon _id.
   * Pour une soumission jamais modifiée, rootUuid == _uuid : les lignes déjà en base (clé = _uuid)
   * restent donc retrouvables sans migration.
   */
  key: string
  /** Toutes les clés sous lesquelles une version de cette soumission a pu être enregistrée. */
  candidates: string[]
  /** _uuid de CETTE version (change à chaque modification). */
  versionUuid: string | null
  rootUuid: string | null
}

export function koboSubmissionIdentity(payload: Record<string, unknown>): KoboSubmissionIdentity {
  const rootUuid = metaField(payload, 'rootUuid')
  const versionUuid = stripUuidPrefix(payload._uuid)
  const deprecated = metaField(payload, 'deprecatedID')
  const numericId =
    typeof payload._id === 'number' || typeof payload._id === 'string' ? String(payload._id) : null

  const key = rootUuid ?? versionUuid ?? numericId ?? ''
  const candidates = [rootUuid, versionUuid, deprecated].filter(
    (v, i, all): v is string => v !== null && all.indexOf(v) === i,
  )
  if (candidates.length === 0 && numericId) candidates.push(numericId)
  return { key, candidates, versionUuid, rootUuid }
}
