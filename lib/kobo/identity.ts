/**
 * Identité d'un membre dans une soumission Kobo — logique PURE (imports relatifs uniquement).
 *
 * UN SEUL module d'extraction pour le webhook, le pull et la relance : avant, le webhook et la
 * synchronisation avaient chacun leur `extractCardNumber` (le webhook lisait une configuration
 * fantôme `field_mapping.member_id`, la synchro traitait le « champ clé » comme un numéro de
 * carte même quand l'administrateur y avait mis le téléphone).
 *
 * Règles :
 *  - la ligne `is_key_field` de kobo_field_mappings désigne l'identifiant de rapprochement ; sa
 *    colonne cible dit de QUOI il s'agit : `card_number` → carte, `phone` → téléphone ;
 *  - une valeur PRÉSENTE mais invalide pour le champ clé n'est jamais convertie en « pas
 *    d'identifiant » (ce qui inscrirait un doublon) : elle est signalée dans `invalid` ;
 *  - sans valeur dans le champ clé, on retombe sur les champs usuels (carte, puis téléphone).
 */
import { createHash } from 'node:crypto'
import { normalizePhone } from '../security/phone'
import { MEMBER_MAPPABLE_COLUMNS, type MemberMappableColumn } from './mapping-targets'
import { getPayloadField } from './payload'

/** Colonnes cibles qui désignent un numéro de carte / un téléphone pour le champ clé. */
const CARD_KEY_COLUMNS = ['card_number', 'member_card_number', 'numero_carte']
const PHONE_KEY_COLUMNS = ['phone', 'telephone']

export interface MappingLike {
  kobo_field: string
  target_table: string
  target_column: string
  transform_fn: string | null
  is_key_field: boolean
}

// ---------------------------------------------------------------------------
// Numéro de carte
// ---------------------------------------------------------------------------

/** Préfixe de lettres, tiret, 4 à 8 chiffres (ex. FEN-547223, AGR-123456). */
export const CARD_NUMBER_RE = /^[A-Z]{2,6}-\d{4,8}$/

/** trim + majuscules + espaces autour du tiret retirés ; null si le format n'est pas valide. */
export function normalizeCardNumber(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const value = String(raw)
    .trim()
    .toUpperCase()
    .replace(/\s*-\s*/g, '-')
  return CARD_NUMBER_RE.test(value) ? value : null
}

// ---------------------------------------------------------------------------
// Lecture d'une valeur par chemin (champs aplatis, groupés, répétés)
// ---------------------------------------------------------------------------

function scalar(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function findByPath(node: unknown, full: string[], from: number): string | null {
  if (node === null || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    // Groupe répété : première occurrence qui porte une valeur.
    for (const item of node) {
      const found = findByPath(item, full, from)
      if (found !== null) return found
    }
    return null
  }
  const obj = node as Record<string, unknown>
  // Kobo aplatit « S5/culture » en UNE clé, et qualifie les enfants d'un groupe répété par le chemin
  // complet : on essaie les préfixes du chemin restant, puis ceux du chemin absolu.
  for (let end = from + 1; end <= full.length; end++) {
    for (const key of [full.slice(from, end).join('/'), full.slice(0, end).join('/')]) {
      if (!(key in obj)) continue
      const value = obj[key]
      if (end === full.length) {
        const leaf = scalar(value)
        if (leaf !== null) return leaf
      } else {
        const deeper = findByPath(value, full, end)
        if (deeper !== null) return deeper
      }
    }
  }
  return null
}

/** Valeur d'un chemin EXACT (« S1/telephone ») : clé aplatie, objet imbriqué ou groupe répété. */
export function readPayloadValue(payload: Record<string, unknown>, path: string): string | null {
  const trimmed = path.trim()
  if (!trimmed) return null
  return findByPath(payload, trimmed.split('/'), 0)
}

export function applyTransform(value: string, transformFn: string | null): string {
  switch (transformFn) {
    case 'uppercase':
      return value.trim().toUpperCase()
    case 'to_number':
      return value.replace(/[^0-9.-]/g, '')
    default:
      return value.trim()
  }
}

// ---------------------------------------------------------------------------
// Clé de rapprochement
// ---------------------------------------------------------------------------

export interface MemberKey {
  /** Numéro de carte valide, normalisé. */
  card: string | null
  /** Téléphone normalisé (E.164). */
  phone: string | null
  /**
   * Le champ clé configuré contient une valeur qui n'est pas exploitable : le traitement doit
   * signaler la soumission (« unmatched » + motif), jamais l'enrôler comme une personne sans identifiant.
   */
  invalid: { kind: 'card' | 'phone'; raw: string } | null
}

const CARD_FALLBACK_FIELDS = [
  'S1/member_card_number',
  'member_card_number',
  'card_number',
  'numero_carte',
  'S1/carte_membre',
  'carte_membre',
]
const PHONE_FALLBACK_FIELDS = ['S1/telephone', 'telephone', 'phone']

function keyMappingOf(mappings: readonly MappingLike[]): MappingLike | null {
  return mappings.find((m) => m.is_key_field) ?? null
}

type KeyKind = 'card' | 'phone' | 'unknown'
function keyKind(mapping: MappingLike): KeyKind {
  const col = mapping.target_column.trim().toLowerCase()
  if (CARD_KEY_COLUMNS.includes(col)) return 'card'
  if (PHONE_KEY_COLUMNS.includes(col)) return 'phone'
  return 'unknown'
}

function firstFallback(payload: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const v = getPayloadField(payload, field)
    if (v) return v
  }
  return null
}

export function extractMemberKey(
  payload: Record<string, unknown>,
  mappings: readonly MappingLike[] = [],
): MemberKey {
  const key: MemberKey = { card: null, phone: null, invalid: null }
  const mapping = keyMappingOf(mappings)

  if (mapping) {
    const rawValue = readPayloadValue(payload, mapping.kobo_field)
    if (rawValue !== null) {
      const value = applyTransform(rawValue, mapping.transform_fn)
      const kind = keyKind(mapping)
      if (kind === 'card') {
        const card = normalizeCardNumber(value)
        if (card) return { ...key, card }
        return { ...key, invalid: { kind: 'card', raw: value } }
      }
      if (kind === 'phone') {
        const phone = normalizePhone(value)
        if (phone) return { ...key, phone }
        return { ...key, invalid: { kind: 'phone', raw: value } }
      }
      // Colonne cible inconnue : on n'invente pas de sens ; une valeur au format carte reste utilisable.
      const card = normalizeCardNumber(value)
      if (card) return { ...key, card }
    }
  }

  // Champs usuels. Une valeur invalide ici (ex. « non » à « numéro de carte ? ») signifie simplement
  // « pas de carte » : la personne est rapprochée par téléphone, sinon inscrite.
  key.card = normalizeCardNumber(firstFallback(payload, CARD_FALLBACK_FIELDS))
  // Un champ source mappé vers `members.phone` (même sans être le champ clé) fait foi avant les noms usuels.
  const phoneMapping = mappings.find(
    (m) => m.target_table === 'members' && m.target_column.trim().toLowerCase() === 'phone',
  )
  const mappedPhone = phoneMapping ? readPayloadValue(payload, phoneMapping.kobo_field) : null
  key.phone =
    normalizePhone(mappedPhone) ?? normalizePhone(firstFallback(payload, PHONE_FALLBACK_FIELDS))
  return key
}

// ---------------------------------------------------------------------------
// Noms
// ---------------------------------------------------------------------------

export interface SubmittedName {
  firstName: string
  lastName: string
}

export function resolveSubmittedName(payload: Record<string, unknown>): SubmittedName {
  const prenom = getPayloadField(payload, 'S1/prenom') ?? getPayloadField(payload, 'prenom') ?? ''
  const nom = getPayloadField(payload, 'S1/nom') ?? getPayloadField(payload, 'nom') ?? ''
  const complet =
    getPayloadField(payload, 'S1/nom_complet') ?? getPayloadField(payload, 'nom_complet') ?? ''
  if (prenom || nom) {
    return { firstName: prenom.trim(), lastName: nom.trim() || prenom.trim() }
  }
  const parts = complet.trim().split(/\s+/).filter(Boolean)
  const first = parts[0] ?? ''
  return { firstName: first, lastName: parts.slice(1).join(' ') || first }
}

/** minuscules, sans accents ni ponctuation. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function nameTokens(...parts: Array<string | null | undefined>): Set<string> {
  const tokens = new Set<string>()
  for (const part of parts) {
    for (const t of (part ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)) {
      if (t.length >= 2) tokens.add(t)
    }
  }
  return tokens
}

/**
 * Deux fiches portant le même téléphone sont-elles la même personne ? Vrai si l'un des noms n'est
 * pas renseigné, ou si au moins un mot (prénom ou nom) est commun. Un téléphone partagé par deux
 * personnes différentes est ainsi signalé à un humain au lieu de fusionner deux membres.
 */
export function namesCompatible(
  submitted: SubmittedName,
  member: { first_name?: string | null; last_name?: string | null },
): boolean {
  const a = nameTokens(submitted.firstName, submitted.lastName)
  const b = nameTokens(member.first_name, member.last_name)
  if (a.size === 0 || b.size === 0) return true
  for (const t of a) if (b.has(t)) return true
  return false
}

// ---------------------------------------------------------------------------
// Profil du membre (champs de la fiche) et correspondances de champs
// ---------------------------------------------------------------------------

export interface MemberProfile {
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  region: string | null
  prefecture: string | null
  canton: string | null
  village: string | null
  date_of_birth: string | null
  faitiere: string | null
}

/** Date ISO (AAAA-MM-JJ…) ou null : une « âge » saisie dans ce champ ferait échouer l'insertion. */
function isoDateOrNull(value: string | null): string | null {
  if (!value) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
  return m ? (m[1] ?? null) : null
}

function nonEmpty(value: string | null | undefined): string | null {
  const v = value?.trim()
  return v ? v : null
}

/**
 * Fiche du membre d'après le payload. Les chemins par défaut sont ceux du formulaire de
 * recensement ; une correspondance `members.<colonne>` de la liste blanche les REMPLACE quand son
 * champ source est renseigné. Les correspondances vers parcelles / productions / cotisations ne
 * sont PAS appliquées (voir lib/validators/kobo.ts) : seules les colonnes de `members` le sont.
 */
export function buildMemberProfile(
  payload: Record<string, unknown>,
  mappings: readonly MappingLike[] = [],
): MemberProfile {
  const name = resolveSubmittedName(payload)
  const rawPhone = getPayloadField(payload, 'S1/telephone') ?? getPayloadField(payload, 'telephone')
  const profile: MemberProfile = {
    first_name: name.firstName,
    last_name: name.lastName,
    phone: nonEmpty(rawPhone),
    email: nonEmpty(getPayloadField(payload, 'S1/email') ?? getPayloadField(payload, 'email')),
    region: nonEmpty(getPayloadField(payload, 'S3/region') ?? getPayloadField(payload, 'region')),
    prefecture: nonEmpty(
      getPayloadField(payload, 'S3/prefecture') ?? getPayloadField(payload, 'prefecture'),
    ),
    canton: nonEmpty(getPayloadField(payload, 'S3/canton') ?? getPayloadField(payload, 'canton')),
    village: nonEmpty(
      getPayloadField(payload, 'S3/village') ?? getPayloadField(payload, 'village'),
    ),
    date_of_birth: isoDateOrNull(
      getPayloadField(payload, 'S1/date_naissance') ?? getPayloadField(payload, 'date_naissance'),
    ),
    faitiere: nonEmpty(
      getPayloadField(payload, 'S2/code_faitiere') ?? getPayloadField(payload, 'code_faitiere'),
    ),
  }

  for (const m of mappings) {
    if (m.target_table !== 'members') continue
    const column = m.target_column.trim().toLowerCase() as MemberMappableColumn
    if (!(MEMBER_MAPPABLE_COLUMNS as readonly string[]).includes(column)) continue
    const raw = readPayloadValue(payload, m.kobo_field)
    if (raw === null) continue
    const value = applyTransform(raw, m.transform_fn)
    if (!value) continue
    const target = profile as unknown as Record<string, string | null>
    target[column] =
      column === 'date_of_birth' ? (isoDateOrNull(value) ?? target[column] ?? null) : value
  }

  // Téléphone stocké en E.164 : le format ne doit plus décider si deux fiches sont « le même numéro »
  // (index unique (cooperative_id, phone)) ni si le SMS peut partir.
  if (profile.phone) profile.phone = normalizePhone(profile.phone) ?? profile.phone
  return profile
}

// ---------------------------------------------------------------------------
// Identifiant de reprise
// ---------------------------------------------------------------------------

/**
 * Identifiant du membre créé par une soumission : DÉTERMINISTE (dérivé de l'id de la ligne
 * kobo_submissions). Une inscription interrompue entre la création du membre et la liaison de la
 * ligne retrouve ainsi SON membre au lieu d'en créer un second.
 */
export function deriveMemberId(submissionId: string): string {
  const h = createHash('sha256').update(`kobo-member:${submissionId}`).digest()
  const b = Buffer.from(h.subarray(0, 16))
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x50 // version 5
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80 // variante RFC 4122
  const hex = b.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
