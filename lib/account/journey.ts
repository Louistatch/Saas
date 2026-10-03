/**
 * Parcours du compte — UNE identité, deux espaces.
 *
 *   User ─ Profile (profiles : nom, e-mail…)        → créé une seule fois
 *        ├─ couche organisation (profiles.role)     → espace FaîtiereHub
 *        └─ extension Haroo (profiles.haroo_type + haroo_*_profiles :
 *           compétences, disponibilité, produits…)  → espace Haroo
 *
 * Deux parcours d'inscription restent distincts (« Commencer » demande
 * l'espace) : opérateur FaîtiereHub, ou professionnel Haroo. Une organisation
 * est ouverte par un opérateur certifié. Un compte d'organisation peut ensuite
 * activer l'extension Haroo (components/account/layer-activation).
 *
 * Ce module dit où en est l'utilisateur et quelle action lui proposer. Il est
 * pur (aucun appel réseau) : il lit l'AuthUser déjà chargé par AuthContext.
 */

import { effectiveHarooType, hasOrgLayer } from '@/lib/utils/permissions'
import type { AuthUser } from '@/types/domain'

export type JourneyStage =
  | 'anonymous'
  /** Compte sans prénom ou nom : à compléter avant tout le reste. */
  | 'profile-incomplete'
  /** Profil complet, extension Haroo non activée. */
  | 'haroo-inactive'
  /** Profil complet, extension Haroo activée. */
  | 'haroo-active'

export interface AccountJourney {
  stage: JourneyStage
  hasOrganization: boolean
  hasHaroo: boolean
  /** Activation Haroo proposée : seulement aux comptes d'organisation. */
  canActivateHaroo: boolean
  /** Page d'accueil du compte connecté (même règle que le middleware). */
  homeUrl: string
}

/** Page unique d'édition du profil commun. */
export const PROFILE_URL = '/compte'
/** Activation de l'extension Haroo sur le compte existant. */
export const HAROO_ACTIVATION_URL = '/dashboard#activer-haroo'
export const HAROO_SPACE_URL = '/haroo'

export function isProfileComplete(user: Pick<AuthUser, 'firstName' | 'lastName'>): boolean {
  return Boolean(user.firstName?.trim() && user.lastName?.trim())
}

export function accountHomeUrl(user: Pick<AuthUser, 'role' | 'harooType'>): string {
  if (user.role === 'super_admin') return '/admin'
  const haroo = effectiveHarooType(user.role, user.harooType)
  return !hasOrgLayer(user.role) && haroo ? HAROO_SPACE_URL : '/dashboard'
}

export function accountJourney(user: AuthUser | null): AccountJourney {
  if (!user)
    return {
      stage: 'anonymous',
      hasOrganization: false,
      hasHaroo: false,
      canActivateHaroo: false,
      homeUrl: '/auth/login',
    }
  const hasHaroo = Boolean(effectiveHarooType(user.role, user.harooType))
  const hasOrganization = hasOrgLayer(user.role)
  const stage: JourneyStage = !isProfileComplete(user)
    ? 'profile-incomplete'
    : hasHaroo
      ? 'haroo-active'
      : 'haroo-inactive'
  return {
    stage,
    hasOrganization,
    hasHaroo,
    canActivateHaroo: hasOrganization && !hasHaroo && user.role !== 'super_admin',
    homeUrl: accountHomeUrl(user),
  }
}

export interface JourneyAction {
  href: string
  label: string
}

/** L'action Haroo à proposer à un compte connecté (null si aucune). */
export function harooAction(journey: AccountJourney): JourneyAction | null {
  if (journey.stage === 'anonymous') return null
  if (journey.stage === 'profile-incomplete')
    return { href: PROFILE_URL, label: 'Compléter mon profil' }
  if (journey.hasHaroo) return { href: HAROO_SPACE_URL, label: 'Accéder à mon espace Haroo' }
  if (journey.canActivateHaroo)
    return { href: HAROO_ACTIVATION_URL, label: 'Activer mon espace Haroo' }
  return null
}
