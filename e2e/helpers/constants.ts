/**
 * E2E Test Constants
 * Centralized configuration for test URLs, credentials, and naming conventions.
 */

export const TEST_PREFIX = 'E2E_TEST_'
export const CARD_PREFIX = 'E2E'

export const ROUTES = {
  home: '/',
  about: '/a-propos',
  contact: '/contact',
  blog: '/blog',
  marketplace: '/marketplace',
  product: '/produit',
  login: '/auth/login',
  signup: '/auth/signup',
  forgotPassword: '/auth/forgot-password',
  signout: '/auth/signout',
  dashboard: '/dashboard',
  dashboardMembers: '/dashboard/members',
  dashboardCards: '/dashboard/cards',
  dashboardMarketplace: '/dashboard/marketplace',
  dashboardAnalytics: '/dashboard/analytics',
  admin: '/admin',
  adminUsers: '/admin/users',
  adminCooperatives: '/admin/cooperatives',
  verify: (cardNumber: string) => `/verify/${encodeURIComponent(cardNumber)}`,
} as const

export const ACCOUNTS = {
  superAdmin: {
    email: process.env.E2E_ADMIN_EMAIL || 'admin@demo.local',
    password: process.env.E2E_ADMIN_PASSWORD || 'Demo123!SuperAdmin',
    role: 'super_admin' as const,
    storageState: '.auth/super-admin.json',
  },
  coopAdmin: {
    email: process.env.E2E_COOP_EMAIL || 'coop-admin@demo.local',
    password: process.env.E2E_COOP_PASSWORD || 'Demo123!CoopAdmin',
    role: 'cooperative_admin' as const,
    storageState: '.auth/coop-admin.json',
  },
  fenomatAdmin: {
    email: process.env.E2E_FENOMAT_EMAIL || 'fenomat@demo.local',
    password: process.env.E2E_FENOMAT_PASSWORD || 'Demo123!CoopAdmin',
    role: 'cooperative_admin' as const,
    storageState: '.auth/fenomat-admin.json',
  },
  member: {
    email: process.env.E2E_MEMBER_EMAIL || 'member1@demo.local',
    password: process.env.E2E_MEMBER_PASSWORD || 'Demo123!Member1',
    role: 'member' as const,
    storageState: '.auth/member.json',
  },
} as const

export const TIMEOUTS = {
  navigation: 30_000,
  action: 15_000,
  assertion: 15_000,
  test: 60_000,
} as const

export const VIEWPORTS = {
  desktop: { width: 1280, height: 720 },
  mobile: { width: 375, height: 667 },
} as const

export const PUBLIC_PAGES = [
  { path: ROUTES.home, heading: 'Donnez du pouvoir à votre coopérative agricole' },
  { path: ROUTES.about, heading: '' }, // Will check for 200 status
  { path: ROUTES.contact, heading: '' },
  { path: ROUTES.blog, heading: '' },
  { path: ROUTES.marketplace, heading: 'Comptes d\'exploitation agricole' },
  { path: ROUTES.login, heading: '' },
] as const
