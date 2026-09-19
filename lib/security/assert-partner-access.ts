/**
 * Contrôle d'accès serveur pour la couche Partenaire/Opérateur certifié.
 *
 * Volontairement séparé de lib/security/assert-access.ts (§20 du plan) : le
 * Partenaire n'est pas un rôle organisationnel, et `assertRole()` ne doit pas
 * apprendre à en connaître un — sinon la couche cesse d'être indépendante
 * pour de vrai, elle ne fait que se cacher dans une autre.
 *
 * Même contrat que le reste du dépôt : `profiles` + les tables `partner_*`
 * font foi ; les claims JWT ne servent qu'au routage (§21). Ces fonctions
 * sont la dernière ligne de défense après RLS, pas un substitut.
 */
import 'server-only'
import { getAccessContext } from '@/lib/security/assert-access'
import type { PartnerAccessScope, PartnerMembershipRole } from '@/types/domain'
import { NextResponse } from 'next/server'

export interface PartnerContext {
  userId: string
  /** Partenaires dont le compte est membre actif — un compte peut en porter plusieurs (§6 du plan). */
  partnerIds: string[]
  supabase: NonNullable<Awaited<ReturnType<typeof getAccessContext>>>['supabase']
}

/**
 * Charge le contexte Partenaire du compte courant. `null` si non authentifié
 * ou sans aucune adhésion Partenaire active — pas une erreur, juste l'absence
 * de cette couche, symétrique à ce que fait getAccessContext() pour la
 * couche organisationnelle.
 */
export async function getPartnerContext(): Promise<PartnerContext | null> {
  const ctx = await getAccessContext()
  if (!ctx) return null

  const { data } = await ctx.supabase
    .from('partner_memberships')
    .select('partner_id')
    .eq('user_id', ctx.userId)
    .eq('status', 'active')
    .returns<{ partner_id: string }[]>()

  const partnerIds = (data ?? []).map((row) => row.partner_id)
  if (partnerIds.length === 0) return null

  return { userId: ctx.userId, partnerIds, supabase: ctx.supabase }
}

/** Authentification Partenaire minimale — au moins une adhésion active, peu importe laquelle. */
export async function assertPartnerAuthenticated() {
  const ctx = await getPartnerContext()
  if (!ctx) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Aucune adhésion Partenaire active' }, { status: 403 }),
    }
  }
  return { ok: true as const, ctx }
}

/**
 * Garde du parcours de formation Opérateur. Une simple session ne suffit pas :
 * le compte doit avoir créé son dossier Opérateur et posséder une adhésion
 * Partenaire active. Cette capacité reste indépendante de profiles.role.
 */
export async function assertOperatorCandidate() {
  const result = await assertPartnerAuthenticated()
  if (!result.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Un compte Opérateur est requis pour accéder à cette formation' },
        { status: 403 },
      ),
    }
  }

  const { data: certification } = await result.ctx.supabase
    .from('partner_certifications')
    .select('id')
    .eq('user_id', result.ctx.userId)
    .not('partner_id', 'is', null)
    .maybeSingle<{ id: string }>()

  if (!certification) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Dossier de formation Opérateur introuvable' },
        { status: 403 },
      ),
    }
  }

  return result
}

/**
 * Le compte est-il membre du Partenaire `partnerId`, avec un rôle au moins
 * égal à `minRole` (owner > manager > agent) ? Utile pour les actions qui ne
 * doivent pas être ouvertes à un simple agent de terrain (ex. gérer l'équipe).
 */
export async function requirePartnerMembership(
  partnerId: string,
  minRole: PartnerMembershipRole = 'agent',
) {
  const result = await assertPartnerAuthenticated()
  if (!result.ok) return result
  const { ctx } = result

  if (!ctx.partnerIds.includes(partnerId)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Non membre de ce Partenaire' }, { status: 403 }),
    }
  }

  const rank: Record<PartnerMembershipRole, number> = { agent: 0, manager: 1, owner: 2 }
  const { data: membership } = await ctx.supabase
    .from('partner_memberships')
    .select('membership_role')
    .eq('partner_id', partnerId)
    .eq('user_id', ctx.userId)
    .eq('status', 'active')
    .single<{ membership_role: PartnerMembershipRole }>()

  if (!membership || rank[membership.membership_role] < rank[minRole]) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Rôle insuffisant dans ce Partenaire' },
        { status: 403 },
      ),
    }
  }

  return { ok: true as const, ctx, role: membership.membership_role }
}

/**
 * Le compte a-t-il, via un de ses Partenaires, un mandat actif sur cette
 * coopérative — et le périmètre demandé si précisé ? Miroir applicatif de
 * `has_partner_org_access()` (RLS) : la route peut ainsi refuser tôt, avec un
 * message utile, plutôt que de laisser la requête échouer silencieusement
 * sur une policy.
 *
 * Rappel (§15 du plan) : un accès délégué positif ici ne dit jamais que le
 * Partenaire POSSÈDE les données de la coopérative — seulement qu'il peut,
 * pour l'instant, agir dessus dans le périmètre accordé.
 */
export async function assertPartnerOrganizationAccess(
  cooperativeId: string,
  scope?: PartnerAccessScope,
) {
  const result = await assertPartnerAuthenticated()
  if (!result.ok) return result
  const { ctx } = result

  const { data: hasAccess } = await ctx.supabase.rpc('has_partner_org_access', {
    target_coop: cooperativeId,
    required_scope: scope ?? null,
  })

  if (!hasAccess) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Aucun mandat actif sur cette organisation' },
        { status: 403 },
      ),
    }
  }

  return { ok: true as const, ctx }
}
