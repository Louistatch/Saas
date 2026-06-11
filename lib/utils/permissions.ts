/**
 * RBAC Permission System — FaîtiereHub
 * 
 * Hierarchy (strict, inviolable):
 * 
 *   SUPER_ADMIN (platform owner)
 *     └── Full control over everything
 * 
 *   FAITIERE_ADMIN (cooperative_admin + cooperative.level = 'faitiere')
 *     ├── Can create/manage child cooperatives (unions + cooperatives)
 *     ├── Can generate cards for members of child cooperatives
 *     ├── Can view all data across child hierarchy
 *     └── Cannot access other faîtières' data
 * 
 *   UNION_ADMIN (cooperative_admin + cooperative.level = 'union')
 *     ├── Can manage child cooperatives under their union
 *     ├── Can generate cards for members of child cooperatives
 *     └── Cannot create faîtières or other unions
 * 
 *   COOPERATIVE_ADMIN (cooperative_admin + cooperative.level = 'cooperative')
 *     ├── Can manage members of their cooperative only
 *     ├── Can generate cards for their members only
 *     ├── Cannot create cooperatives
 *     └── Cannot see other cooperatives' data
 * 
 *   MEMBER (role = 'member')
 *     ├── Can view own profile and card
 *     ├── Can access marketplace (free with card)
 *     └── No administrative access
 * 
 *   GUEST (role = 'guest')
 *     └── Public marketplace only (paid access)
 * 
 * RULES:
 * - A cooperative CANNOT exist without a parent (faîtière or union)
 * - A member CANNOT exist without a cooperative
 * - Card generation requires cooperative_admin role minimum
 * - Only faîtière/union admins can create child cooperatives
 */

import type { UserRole } from '@/types/domain'

// ─── Effective Role Resolution ───────────────────────────────────────────────

export type EffectiveRole = 
  | 'super_admin' 
  | 'faitiere_admin' 
  | 'union_admin' 
  | 'cooperative_admin' 
  | 'member' 
  | 'guest'

/**
 * Resolve the effective role based on the user's DB role + their cooperative's level.
 * This is the single source of truth for permission checks.
 */
export function resolveEffectiveRole(
  role?: UserRole | null,
  cooperativeLevel?: string | null,
): EffectiveRole {
  if (!role) return 'guest'
  if (role === 'super_admin') return 'super_admin'
  if (role === 'member') return 'member'
  if (role === 'guest') return 'guest'
  
  // cooperative_admin — differentiate by cooperative level
  if (role === 'cooperative_admin') {
    switch (cooperativeLevel) {
      case 'faitiere': return 'faitiere_admin'
      case 'union': return 'union_admin'
      default: return 'cooperative_admin'
    }
  }
  
  return 'guest'
}

// ─── Permission Checks ──────────────────────────────────────────────────────

/** Platform-level admin (super_admin only) */
export function isSuperAdmin(role?: UserRole | null): boolean {
  return role === 'super_admin'
}

/** Any admin role (super_admin or cooperative_admin at any level) */
export function isAdmin(role?: UserRole | null): boolean {
  return role === 'super_admin' || role === 'cooperative_admin'
}

/** Can this user manage members? (any admin) */
export function canManageMembers(role?: UserRole | null): boolean {
  return role === 'super_admin' || role === 'cooperative_admin'
}

/** Can this user generate/manage cards? (any admin) */
export function canManageCards(role?: UserRole | null): boolean {
  return role === 'super_admin' || role === 'cooperative_admin'
}

/** Can this user manage cooperative settings? */
export function canManageCooperative(role?: UserRole | null): boolean {
  return role === 'super_admin' || role === 'cooperative_admin'
}

/** Professionnel Haroo (ouvrier, acheteur ou agronome) — espace dédié /haroo */
export function isHarooRole(role?: UserRole | null): boolean {
  return role === 'ouvrier' || role === 'acheteur' || role === 'agronome'
}

/** Can this user manage the marketplace (fiches techniques)? */
export function canManageMarketplace(role?: UserRole | null): boolean {
  return role === 'super_admin' || role === 'cooperative_admin'
}

/** Can this user view the admin panel? (super_admin only) */
export function canViewAdminPanel(role?: UserRole | null): boolean {
  return role === 'super_admin'
}

/**
 * Can this user CREATE child cooperatives?
 * Only faîtière admins, union admins, and super_admin can create cooperatives.
 * Regular cooperative admins CANNOT create cooperatives.
 */
export function canCreateCooperatives(
  role?: UserRole | null,
  cooperativeLevel?: string | null,
): boolean {
  if (role === 'super_admin') return true
  if (role !== 'cooperative_admin') return false
  return cooperativeLevel === 'faitiere' || cooperativeLevel === 'union'
}

/**
 * Can this user generate cards for a specific cooperative?
 * - super_admin: any cooperative
 * - faitiere_admin: any child cooperative
 * - union_admin: any child cooperative
 * - cooperative_admin: own cooperative only
 */
export function canGenerateCardsFor(
  userRole: UserRole | undefined,
  userCoopId: string | undefined,
  userCoopLevel: string | undefined,
  targetCoopId: string,
  accessibleCoopIds: string[],
): boolean {
  if (userRole === 'super_admin') return true
  if (userRole !== 'cooperative_admin') return false
  
  // Check if target cooperative is in the user's accessible hierarchy
  return accessibleCoopIds.includes(targetCoopId)
}

// ─── Role Labels ────────────────────────────────────────────────────────────

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'super_admin': return 'Super Admin'
    case 'cooperative_admin': return 'Administrateur'
    case 'member': return 'Membre'
    case 'guest': return 'Invité'
    case 'ouvrier': return 'Ouvrier Haroo'
    case 'acheteur': return 'Acheteur Haroo'
    case 'agronome': return 'Agronome Haroo'
  }
}

export function effectiveRoleLabel(effectiveRole: EffectiveRole): string {
  switch (effectiveRole) {
    case 'super_admin': return 'Super Admin (Plateforme)'
    case 'faitiere_admin': return 'Admin Faîtière'
    case 'union_admin': return 'Admin Union Régionale'
    case 'cooperative_admin': return 'Admin Coopérative'
    case 'member': return 'Membre'
    case 'guest': return 'Invité'
  }
}

// ─── Hierarchy Validation ───────────────────────────────────────────────────

/**
 * Validate that a cooperative can be created at the given level under the given parent.
 * 
 * Rules:
 * - faitiere: can only be created by super_admin (no parent required)
 * - union: must have a faitiere as parent
 * - cooperative: must have a union or faitiere as parent
 */
export function validateCooperativeCreation(
  level: string,
  parentLevel: string | null,
  creatorRole: EffectiveRole,
): { valid: boolean; error?: string } {
  // Only super_admin can create faîtières
  if (level === 'faitiere') {
    if (creatorRole !== 'super_admin') {
      return { valid: false, error: 'Seul le super admin peut créer une faîtière' }
    }
    return { valid: true }
  }

  // Unions must be under a faîtière
  if (level === 'union') {
    if (creatorRole !== 'super_admin' && creatorRole !== 'faitiere_admin') {
      return { valid: false, error: 'Seul un admin faîtière peut créer une union régionale' }
    }
    if (parentLevel !== 'faitiere') {
      return { valid: false, error: 'Une union doit être rattachée à une faîtière' }
    }
    return { valid: true }
  }

  // Cooperatives must be under a union or faîtière
  if (level === 'cooperative') {
    if (creatorRole !== 'super_admin' && creatorRole !== 'faitiere_admin' && creatorRole !== 'union_admin') {
      return { valid: false, error: 'Seul un admin faîtière ou union peut créer une coopérative' }
    }
    if (parentLevel !== 'faitiere' && parentLevel !== 'union') {
      return { valid: false, error: 'Une coopérative doit être rattachée à une union ou faîtière' }
    }
    return { valid: true }
  }

  return { valid: false, error: `Niveau "${level}" non reconnu` }
}
