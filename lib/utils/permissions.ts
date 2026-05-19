import type { UserRole } from '@/types/domain'

export function isAdmin(role?: UserRole | null) {
  return role === 'super_admin' || role === 'cooperative_admin'
}

export function isSuperAdmin(role?: UserRole | null) {
  return role === 'super_admin'
}

export function canManageMembers(role?: UserRole | null) {
  return role === 'super_admin' || role === 'cooperative_admin'
}

export function canManageCards(role?: UserRole | null) {
  return role === 'super_admin' || role === 'cooperative_admin'
}

export function canManageCooperative(role?: UserRole | null) {
  return role === 'super_admin' || role === 'cooperative_admin'
}

export function canManageMarketplace(role?: UserRole | null) {
  return role === 'super_admin' || role === 'cooperative_admin'
}

export function canViewAdminPanel(role?: UserRole | null) {
  return role === 'super_admin'
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'super_admin':
      return 'Super Admin'
    case 'cooperative_admin':
      return 'Cooperative Admin'
    case 'member':
      return 'Member'
    case 'guest':
      return 'Guest'
  }
}
