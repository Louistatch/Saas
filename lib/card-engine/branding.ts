/**
 * Identité visuelle d'une carte : résolue UNE fois, pour tous les chemins de
 * sortie (aperçu, téléchargement, feuille imprimée, API).
 *
 * Avant, quatre chemins différents remontaient (ou non) la hiérarchie, et le
 * repli sur un nom de faîtière était un libellé codé en dur qui fuyait d'une
 * organisation vers toutes les autres. Ici : la lignée faîtière > union >
 * coopérative se déduit de `parent_id` / `level`, la couleur et le logo
 * viennent des réglages existants de l'organisation, et rien n'est inventé.
 */

import type { OrgLevel } from './schema'

export interface BrandingOrg {
  id: string
  name: string
  level?: string | null
  parentId?: string | null
  logoUrl?: string | null
  /** Couleur principale de l'organisation (cooperatives.primary_color). */
  primaryColor?: string | null
  /** Nom de faîtière saisi en texte (cooperatives.faitiere_name), à défaut de parent. */
  faitiereName?: string | null
}

/** Modèle de carte enregistré (cooperative_settings.card_template). */
export interface BrandingTemplate {
  title?: string | null
  subtitle?: string | null
  bgColor?: string | null
  accentColor?: string | null
}

export interface ResolvedCardBranding {
  organisationId: string
  organisationLevel: OrgLevel
  cooperativeName: string
  cooperativeLogoUrl: string | null
  unionName: string | null
  faitiereName: string | null
  faitiereLogoUrl: string | null
  brandColor: string | null
  accentColor: string | null
  template: { title: string | null; subtitle: string | null }
}

const MAX_DEPTH = 6

function level(org: BrandingOrg | undefined): OrgLevel | null {
  const v = org?.level
  return v === 'faitiere' || v === 'union' || v === 'cooperative' ? v : null
}

/**
 * Lignée de l'organisation, de la plus proche (elle-même) à la plus haute.
 * Bornée et protégée des cycles de `parent_id`.
 */
export function organisationChain(
  organisationId: string,
  orgs: ReadonlyArray<BrandingOrg>,
): BrandingOrg[] {
  const byId = new Map(orgs.map((o) => [o.id, o]))
  const chain: BrandingOrg[] = []
  const seen = new Set<string>()
  let current = byId.get(organisationId)
  while (current && !seen.has(current.id) && chain.length < MAX_DEPTH) {
    chain.push(current)
    seen.add(current.id)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return chain
}

export function resolveCardBranding(input: {
  organisationId: string
  /** Toutes les organisations connues de l'appelant (au moins la lignée). */
  orgs: ReadonlyArray<BrandingOrg>
  /**
   * Modèles enregistrés, par identifiant d'organisation. Le plus proche de la
   * coopérative du membre l'emporte. Ne pas y mettre un modèle jamais
   * enregistré : ses couleurs par défaut masqueraient celles de l'organisation.
   */
  templates?: Readonly<Record<string, BrandingTemplate | null | undefined>>
}): ResolvedCardBranding | null {
  const chain = organisationChain(input.organisationId, input.orgs)
  const self = chain[0]
  if (!self) return null

  const selfLevel = level(self) ?? 'cooperative'
  const ancestors = chain.slice(1)

  const faitiereOrg =
    selfLevel === 'faitiere' ? undefined : ancestors.find((o) => level(o) === 'faitiere')
  const unionOrg =
    selfLevel === 'cooperative' ? ancestors.find((o) => level(o) === 'union') : undefined

  // Faîtière sans enregistrement parent : repli sur le nom saisi en texte.
  const faitiereText = chain.map((o) => o.faitiereName?.trim()).find((n) => n)
  const faitiereName =
    faitiereOrg?.name ?? (selfLevel === 'faitiere' ? null : (faitiereText ?? null))

  const savedTemplate = chain
    .map((o) => input.templates?.[o.id])
    .find((t): t is BrandingTemplate => Boolean(t))
  const primary = chain.map((o) => o.primaryColor?.trim()).find((c) => c)

  return {
    organisationId: self.id,
    organisationLevel: selfLevel,
    cooperativeName: self.name,
    cooperativeLogoUrl: self.logoUrl ?? null,
    unionName: unionOrg?.name ?? null,
    faitiereName,
    faitiereLogoUrl: faitiereOrg?.logoUrl ?? null,
    brandColor: savedTemplate?.bgColor ?? primary ?? null,
    accentColor: savedTemplate?.accentColor ?? null,
    template: {
      title: savedTemplate?.title ?? null,
      subtitle: savedTemplate?.subtitle ?? null,
    },
  }
}
