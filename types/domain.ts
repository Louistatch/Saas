/**
 * Domain models — single source of truth.
 *
 * Database tables use snake_case; we expose camelCase to UI code where
 * sensible, and snake_case where the DB shape leaks (e.g. `Member`, which
 * is heavily used in CRUD forms).
 */

export type UserRole = 'super_admin' | 'cooperative_admin' | 'member' | 'guest'

export const USER_ROLES = [
  'super_admin',
  'cooperative_admin',
  'member',
  'guest',
] as const satisfies readonly UserRole[]

export type MemberStatus = 'active' | 'inactive' | 'suspended'
export type CardStatus = 'active' | 'pending' | 'expired' | 'revoked'
export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'syncing'
export type IntegrationType = 'kobo' | 'google_sheets' | 'email' | 'payment'

export interface Profile {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  role: UserRole
  cooperative_id: string | null
  created_at: string
  cooperative?: { name: string } | null
}

export interface AuthUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  cooperativeId?: string
}

export interface Cooperative {
  id: string
  name: string
  description?: string
  logo?: string
  primaryColor?: string
  faitiereName?: string
  level?: string
  parentId?: string
  memberCount?: number
  exploitationCount?: number
}

export interface CooperativeRow {
  id: string
  name: string
  description: string | null
  primary_color: string | null
  logo_url: string | null
  faitiere_name: string | null
  level: string | null
  parent_id: string | null
  created_at: string
}

export interface Member {
  id: string
  cooperative_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  address: string | null
  photo_url: string | null
  signature_url: string | null
  prefecture: string | null
  region: string | null
  village: string | null
  canton: string | null
  faitiere: string | null
  status: MemberStatus
  created_at: string
}

export interface Exploitation {
  id: string
  cooperative_id: string
  name: string
  description: string | null
  category: string | null
  price: number | null
  unit: string | null
  producer: string | null
  active: boolean
  created_at: string
}

export interface MemberCard {
  id: string
  cooperative_id: string
  member_id: string
  card_number: string
  status: CardStatus
  expiry_date: string | null
  qr_data: string | null
  created_at: string
  member?: Pick<Member, 'first_name' | 'last_name' | 'email' | 'phone' | 'photo_url' | 'signature_url' | 'prefecture' | 'region' | 'village' | 'canton' | 'faitiere'> | null
}

export interface CardTemplate {
  title: string
  subtitle: string
  bgColor: string
  accentColor: string
  textColor: string
}

export interface CardSettings {
  defaultValidityDays: number
  qrCodeIncludes: {
    cardNumber: boolean
    memberId: boolean
    cooperativeId: boolean
  }
}

export interface CooperativeSettings {
  cooperative_id: string
  card_template: CardTemplate
  card_settings: CardSettings
  created_at: string
  updated_at: string
}

export interface IntegrationRow {
  id: string
  cooperative_id: string
  type: IntegrationType
  config: Record<string, unknown>
  status: IntegrationStatus
  last_sync_at: string | null
  created_at: string
}

export const DEFAULT_CARD_TEMPLATE: CardTemplate = {
  title: 'Carte de Membre',
  subtitle: "Pass d'accès coopératif",
  bgColor: '#0d3d22',
  accentColor: '#1ed760',
  textColor: '#ffffff',
}

export const DEFAULT_CARD_SETTINGS: CardSettings = {
  defaultValidityDays: 365,
  qrCodeIncludes: {
    cardNumber: true,
    memberId: true,
    cooperativeId: true,
  },
}

export const PRODUCT_CATEGORIES = [
  'Vegetables',
  'Dairy',
  'Grains',
  'Fruits',
  'Seeds',
  'Equipment',
  'Services',
] as const
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]
