// Service Registry — single source of truth for the "+ Services" launcher.
//
// Grounded strictly in what actually exists (see docs/FAITIEREHUB_ECOSYSTEM_AUDIT.md):
// - `type: 'native'`    — code lives in this repo, runs in-process
// - `type: 'connected'` — separate space/tables in the SAME Supabase project,
//                         reached via a route in this app (Haroo)
// - `type: 'external'`  — a different service (AgriTogo, Flask/Railway) reached
//                         only through server-side proxy API routes; there is
//                         no direct user-facing URL for it in this codebase
//
// Adding a service = adding an entry here. Nothing else should hardcode this list.

import type { LucideIcon } from 'lucide-react'
import {
  Home, Users, IdCard, Banknote, Leaf, ShoppingBag, BookOpen, Handshake,
  BarChart3, Map, GraduationCap, ShoppingCart, FolderOpen, PhoneCall, Zap,
  Smartphone, Code, Network,
} from 'lucide-react'

export type ServiceType = 'native' | 'connected' | 'external'
export type ServiceStatus = 'healthy' | 'degraded' | 'broken' | 'disconnected' | 'legacy' | 'unknown'

export interface ServiceDefinition {
  id: string
  name: string
  description: string
  icon: LucideIcon
  category: string
  route: string
  type: ServiceType
  /** Roles allowed to see this entry. Empty/omitted = visible to any authenticated user. */
  roles?: string[]
  status: ServiceStatus
  /** True when this opens outside the current Next.js app (new tab / different origin). */
  external?: boolean
}

export const SERVICE_REGISTRY: ServiceDefinition[] = [
  // ── Coopérative ──────────────────────────────────────────────────────────
  { id: 'dashboard', name: "Vue d'ensemble", description: 'Tableau de bord de la coopérative', icon: Home, category: 'Coopérative', route: '/dashboard', type: 'native', status: 'healthy' },
  { id: 'members', name: 'Membres', description: 'Gestion des membres et scores Bronze/Silver/Gold', icon: Users, category: 'Coopérative', route: '/dashboard/members', type: 'native', roles: ['super_admin', 'cooperative_admin', 'member'], status: 'healthy' },
  { id: 'cards', name: 'Cartes membres', description: 'Émission et gestion des cartes QR', icon: IdCard, category: 'Coopérative', route: '/dashboard/cards', type: 'native', roles: ['super_admin', 'cooperative_admin', 'member'], status: 'healthy' },
  { id: 'cotisations', name: 'Cotisations', description: 'Suivi des paiements — TMoney, Flooz, Orange Money, espèces', icon: Banknote, category: 'Coopérative', route: '/dashboard/cotisations', type: 'native', roles: ['super_admin', 'cooperative_admin'], status: 'healthy' },
  { id: 'parcelles', name: 'Parcelles', description: 'Exploitations et cultures des membres', icon: Leaf, category: 'Coopérative', route: '/dashboard/parcelles', type: 'native', roles: ['super_admin', 'cooperative_admin'], status: 'healthy' },

  // ── Agricole ─────────────────────────────────────────────────────────────
  { id: 'agrimarket', name: 'AgriMarket', description: 'Place de marché agricole', icon: ShoppingBag, category: 'Agricole', route: '/dashboard/agrimarket', type: 'native', status: 'healthy' },
  { id: 'carnet', name: 'Carnet Agricole', description: 'Journal, intrants et campagnes', icon: BookOpen, category: 'Agricole', route: '/dashboard/carnet', type: 'native', status: 'healthy' },
  { id: 'matching', name: 'Matching', description: 'Mise en relation producteurs / acheteurs', icon: Handshake, category: 'Agricole', route: '/dashboard/matching', type: 'native', roles: ['super_admin', 'cooperative_admin'], status: 'healthy' },
  { id: 'credit', name: 'AgriCredit', description: 'Demandes de crédit et scoring', icon: BarChart3, category: 'Agricole', route: '/dashboard/credit', type: 'native', roles: ['super_admin', 'cooperative_admin'], status: 'healthy' },

  // ── Analyse ──────────────────────────────────────────────────────────────
  { id: 'analytics', name: 'Statistiques', description: 'Indicateurs et croissance de la coopérative', icon: BarChart3, category: 'Analyse', route: '/dashboard/analytics', type: 'native', roles: ['super_admin', 'cooperative_admin'], status: 'healthy' },
  { id: 'carte', name: 'Carte Agricole', description: 'Répartition géographique par préfecture', icon: Map, category: 'Analyse', route: '/dashboard/carte', type: 'native', roles: ['super_admin', 'cooperative_admin'], status: 'healthy' },
  { id: 'academy', name: 'AgriAcademy', description: 'Modules de formation certifiante', icon: GraduationCap, category: 'Analyse', route: '/dashboard/academy', type: 'native', status: 'healthy' },

  // ── Gestion ──────────────────────────────────────────────────────────────
  { id: 'marketplace', name: 'Exploitations', description: "Comptes d'exploitation publics", icon: ShoppingCart, category: 'Gestion', route: '/dashboard/marketplace', type: 'native', status: 'healthy' },
  { id: 'templates', name: 'Modèles', description: 'Fiches techniques et documents', icon: FolderOpen, category: 'Gestion', route: '/dashboard/templates', type: 'native', roles: ['super_admin', 'cooperative_admin'], status: 'healthy' },
  { id: 'techniciens', name: 'Techniciens', description: 'Carnet de contacts techniques', icon: PhoneCall, category: 'Gestion', route: '/dashboard/techniciens', type: 'native', roles: ['super_admin', 'cooperative_admin'], status: 'healthy' },
  { id: 'integrations', name: 'Intégrations', description: 'Connecteurs tiers', icon: Zap, category: 'Gestion', route: '/dashboard/integrations', type: 'native', roles: ['super_admin', 'cooperative_admin'], status: 'healthy' },
  { id: 'kobo', name: 'KoboCollect', description: 'Synchronisation des formulaires terrain', icon: Smartphone, category: 'Gestion', route: '/dashboard/kobo-setup', type: 'native', roles: ['super_admin', 'cooperative_admin'], status: 'healthy' },
  { id: 'embed', name: 'Widget Embed', description: 'Intégration sur un site tiers (embed_configs)', icon: Code, category: 'Gestion', route: '/dashboard/embed', type: 'native', roles: ['super_admin', 'cooperative_admin'], status: 'healthy' },

  // ── Écosystème ───────────────────────────────────────────────────────────
  // Haroo has a real standalone route. AgriTogo-powered features (AI chat,
  // AgriSmart irrigation) do NOT — they only exist embedded inside the
  // dynamic /verify/[card_number] flow, reachable after scanning a specific
  // card. There is no generic "/assistant" or "/agrismart" entry point today,
  // so they are deliberately left out of this launcher rather than shipping
  // a dead link. See docs/FAITIEREHUB_ECOSYSTEM_AUDIT.md, section "Écosystème".
  {
    id: 'haroo', name: 'Haroo', description: 'Espace ouvriers, acheteurs, agronomes — mêmes tables Supabase, espace séparé',
    icon: Network, category: 'Écosystème', route: '/haroo', type: 'connected',
    status: 'healthy', // gated by ProtectedRoute + isHarooRole client-side, non-Haroo users are redirected out
  },
]

export function getVisibleServices(role: string | undefined): ServiceDefinition[] {
  return SERVICE_REGISTRY.filter((s) => !s.roles || (role && s.roles.includes(role)))
}
