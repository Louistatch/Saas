/**
 * Domain models — single source of truth.
 *
 * Database tables use snake_case; we expose camelCase to UI code where
 * sensible, and snake_case where the DB shape leaks (e.g. `Member`, which
 * is heavily used in CRUD forms).
 */

/**
 * Un compte porte deux couches indépendantes :
 *   - `role`       : la couche organisationnelle (coopératives)
 *   - `harooType`  : la couche Haroo (professionnels indépendants)
 * Chacune peut être absente, et les deux peuvent coexister sur un même compte.
 */
export type UserRole =
  | 'super_admin'
  | 'cooperative_admin'
  | 'member'
  /** Aucune couche organisationnelle — compte Haroo seul, ou en cours d'onboarding. */
  | 'none'
  /** Déprécié : disait la même chose que `none`. Conservé, jamais écrit. */
  | 'guest'
  // Dépréciés : la couche Haroo vit désormais dans `harooType`. Ces valeurs
  // restent typées le temps que les comptes créés avant la bascule soient
  // migrés, et parce qu'un enum Postgres ne se dégarnit pas.
  | 'ouvrier'
  | 'acheteur'
  | 'agronome'

export const USER_ROLES = [
  'super_admin',
  'cooperative_admin',
  'member',
  'guest',
  'none',
  'ouvrier',
  'acheteur',
  'agronome',
] as const satisfies readonly UserRole[]

/** Couche Haroo. `null` = non activée. Un seul profil à la fois. */
export type HarooType = 'ouvrier' | 'acheteur' | 'agronome'

export const HAROO_TYPES = [
  'ouvrier',
  'acheteur',
  'agronome',
] as const satisfies readonly HarooType[]

export const HAROO_TYPE_LABELS: Record<HarooType, string> = {
  ouvrier: 'Ouvrier agricole',
  acheteur: 'Acheteur',
  agronome: 'Agronome',
}

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
  haroo_type: HarooType | null
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
  harooType: HarooType | null
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
  member?: Pick<
    Member,
    | 'first_name'
    | 'last_name'
    | 'email'
    | 'phone'
    | 'photo_url'
    | 'signature_url'
    | 'prefecture'
    | 'region'
    | 'village'
    | 'canton'
    | 'faitiere'
  > | null
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

// ─── Partenaire / Opérateur certifié ─────────────────────────────────────────
//
// Troisième couche de compte, indépendante de `role` et `haroo_type`
// (cf. supabase/migrations/20260920_100000_partner_capability_foundation.sql).
// Un compte peut être admin de coopérative, ouvrier Haroo, ET partenaire
// certifié — simultanément.

export type PartnerStatus =
  | 'candidate'
  | 'training'
  | 'exam_pending'
  | 'certified'
  | 'active'
  | 'suspended'
  | 'expired'
  | 'revoked'

export const PARTNER_STATUSES = [
  'candidate',
  'training',
  'exam_pending',
  'certified',
  'active',
  'suspended',
  'expired',
  'revoked',
] as const satisfies readonly PartnerStatus[]

export type PartnerMembershipRole = 'owner' | 'manager' | 'agent'

export const PARTNER_MEMBERSHIP_ROLES = [
  'owner',
  'manager',
  'agent',
] as const satisfies readonly PartnerMembershipRole[]

export type PartnerMembershipStatus = 'active' | 'revoked'

export type PartnerAssignmentStatus = 'active' | 'revoked' | 'ended'

/**
 * Périmètres d'accès délégué qu'un mandat Partenaire↔Organisation peut
 * porter. Un accès délégué n'est jamais total : il est composé de ces
 * périmètres explicites, jamais d'un rôle générique.
 */
export type PartnerAccessScope =
  | 'members.read'
  | 'members.manage'
  | 'cards.read'
  | 'cards.manage'
  | 'cards.print'
  | 'kobo.manage'
  | 'imports.manage'
  | 'analytics.read'
  | 'reports.generate'
  | 'projects.manage'
  | 'support.manage'

export const PARTNER_ACCESS_SCOPES = [
  'members.read',
  'members.manage',
  'cards.read',
  'cards.manage',
  'cards.print',
  'kobo.manage',
  'imports.manage',
  'analytics.read',
  'reports.generate',
  'projects.manage',
  'support.manage',
] as const satisfies readonly PartnerAccessScope[]

export interface Partner {
  id: string
  partner_code: string
  business_name: string | null
  display_name: string
  phone: string | null
  email: string | null
  region_id: string | null
  prefecture_id: string | null
  status: PartnerStatus
  created_at: string
  updated_at: string
  suspended_at: string | null
}

export interface PartnerMembership {
  id: string
  partner_id: string
  user_id: string
  membership_role: PartnerMembershipRole
  status: PartnerMembershipStatus
  created_at: string
  updated_at: string
}

export interface PartnerCertification {
  id: string
  user_id: string
  academy_module_id: string | null
  training_completed_at: string | null
  exam_score: number | null
  exam_passed_at: string | null
  certified_at: string | null
  partner_id: string | null
  created_at: string
  updated_at: string
}

export interface PartnerOrganizationAssignment {
  id: string
  partner_id: string
  cooperative_id: string
  status: PartnerAssignmentStatus
  is_primary_operator: boolean
  started_at: string
  ended_at: string | null
  approved_by: string | null
  revoked_by: string | null
  created_at: string
  updated_at: string
  /** Chargé séparément (table de jointure `partner_assignment_scopes`) ; absent tant que non demandé. */
  scopes?: PartnerAccessScope[]
}
