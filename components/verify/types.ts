/**
 * Domain types for the public card verification feature.
 * Centralized so every verify component shares one contract.
 */

export interface VerifyMember {
  first_name: string | null
  last_name: string | null
  photo_url: string | null
  village: string | null
  canton: string | null
  prefecture: string | null
  region: string | null
  status: string
  member_since: string | null
}

export interface VerifyCard {
  card_number: string
  status: string
  expiry_date: string | null
  created_at: string
}

export interface VerifyCooperative {
  name: string
  faitiere_name: string | null
}

export interface VerifyResult {
  valid: boolean
  card?: VerifyCard
  member?: VerifyMember
  cooperative?: VerifyCooperative
  error?: string
}

export interface TechnicienContact {
  role: 'technicien' | 'coordo'
  name: string
  phone: string
  canton?: string | null
}

export type VerifyView = 'menu' | 'identity' | 'prices' | 'technicien'

/** Full name, last name uppercased for the card. Null-safe. */
export function memberFullName(m: Pick<VerifyMember, 'first_name' | 'last_name'>): string {
  const first = (m.first_name ?? '').trim()
  const last = (m.last_name ?? '').trim().toUpperCase()
  const full = `${first} ${last}`.trim()
  return full || 'Membre'
}

/** Locality string from the most specific available geo field. */
export function memberLocality(m: VerifyMember): string {
  return [m.village, m.canton, m.prefecture, m.region].filter(Boolean).join(', ')
}

/** Normalize a Togo phone for a wa.me link (prefix 228 when 8 digits). */
export function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('228')) return digits
  if (digits.length === 8) return `228${digits}`
  return digits
}

/** Format an ISO date in French, uppercased (e.g. "20 MAI 2027"). */
export function formatFrDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso)
    .toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase()
}
