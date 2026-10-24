import type { KoboFieldMappingRow } from './types'

type Payload = Record<string, unknown>
type Mapping = Pick<
  KoboFieldMappingRow,
  'kobo_field' | 'target_table' | 'target_column' | 'transform_fn'
>

const MEMBER_FIELDS: Record<string, string> = {
  first_name: 'S1/prenom',
  last_name: 'S1/nom',
  full_name: 'S1/nom_complet',
  nom_complet: 'S1/nom_complet',
  phone: 'S1/telephone',
  email: 'S1/email',
  date_of_birth: 'S1/date_naissance',
  gender: 'S1/sexe',
  photo_url: 'S1/photo_membre',
  signature_url: 'S7/signature_membre',
  region: 'S3/region',
  prefecture: 'S3/prefecture',
  canton: 'S3/canton',
  village: 'S3/village',
  cooperative_name: 'S2/nom_cooperative',
  consent: 'S1/consentement_donnees',
  card_number: 'member_card_number',
}
const REPEAT_FIELDS: Record<string, Record<string, string>> = {
  parcelles: {
    culture_principale: 'culture_principale',
    superficie_ha: 'superficie_ha',
    soil_type: 'type_sol',
    type_sol: 'type_sol',
    irrigation_type: 'irrigation',
    irrigation: 'irrigation',
  },
  productions: {
    culture: 'culture_produite',
    culture_name: 'culture_produite',
    quantity_kg: 'rendement_kg',
    rendement_kg: 'rendement_kg',
    campaign: 'campagne_annee',
    campaign_year: 'campagne_annee',
  },
}

function valueAt(record: Payload, path: string): unknown {
  if (Object.hasOwn(record, path)) return record[path]
  let value: unknown = record
  for (const part of path.split('/')) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    value = (value as Payload)[part]
  }
  return value
}
function transform(value: unknown, fn: string | null): unknown {
  if (value == null || typeof value === 'object') return value
  const text = String(value).trim()
  if (fn === 'uppercase') return text.toUpperCase()
  if (fn === 'to_number') return text.replace(',', '.')
  return text
}

/**
 * Fixed internal schema, configurable source paths. The original payload stays untouched.
 * Only an explicit allowlist can populate application fields; unknown questions remain raw.
 * Labels/order can change freely. Renamed XML fields use a revised mapping, never generated code.
 */
export function normalizeKoboPayload(raw: Payload, mappings: readonly Mapping[]): Payload {
  const out: Payload = { ...raw }
  const repeats = new Map<string, Payload[]>()
  for (const mapping of mappings) {
    if (mapping.target_table === 'members') {
      const target = MEMBER_FIELDS[mapping.target_column]
      if (!target) continue
      // Legacy configuration mapped the complete name to first_name. Keep its original split.
      if (mapping.target_column === 'first_name' && mapping.kobo_field === 'S1/nom_complet')
        continue
      const value = valueAt(raw, mapping.kobo_field)
      if (value != null && value !== '') out[target] = transform(value, mapping.transform_fn)
      continue
    }
    const column = REPEAT_FIELDS[mapping.target_table]?.[mapping.target_column]
    if (!column) continue // Cotisation counts must never become financial payments.
    const group = mapping.target_table === 'parcelles' ? 'S5' : 'S6'
    const parts = mapping.kobo_field.split('/')
    for (let cut = 1; cut < parts.length; cut++) {
      const prefix = parts.slice(0, cut).join('/')
      const source = valueAt(raw, prefix)
      if (!Array.isArray(source)) continue
      const key = `${group}:${prefix}`
      const rows = repeats.get(key) ?? source.map(() => ({}))
      source.forEach((row: unknown, i) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return
        const record = row as Payload
        const value =
          valueAt(record, mapping.kobo_field) ?? valueAt(record, parts.slice(cut).join('/'))
        if (value != null)
          (rows[i] as Payload)[`${group}/${column}`] = transform(value, mapping.transform_fn)
      })
      repeats.set(key, rows)
      break
    }
  }
  for (const group of ['S5', 'S6']) {
    const mapped = [...repeats].filter(([key]) => key.startsWith(`${group}:`))
    if (!mapped.length) continue
    // Standard forms retain their other repeat fields. Custom repeat groups are translated.
    if (
      mapped.length === 1 &&
      mapped[0]?.[0] === `${group}:${group}` &&
      Array.isArray(raw[group])
    ) {
      out[group] = (raw[group] as Payload[]).map((row, i) => ({ ...row, ...mapped[0]?.[1][i] }))
    } else out[group] = mapped.flatMap(([, rows]) => rows)
  }
  return out
}
