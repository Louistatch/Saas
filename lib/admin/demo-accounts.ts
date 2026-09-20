/**
 * Comptes de démo — permettent au super_admin de « jouer chaque rôle » pour
 * voir le site comme un membre, un compte Haroo (ouvrier/acheteur/agronome)
 * ou un candidat Opérateur sans organisation, sans jamais toucher un vrai
 * compte utilisateur (choix explicite : le moins risqué des deux options
 * discutées — pas d'usurpation de session réelle, uniquement des comptes
 * synthétiques dédiés, marqués `is_demo = true`).
 *
 * Un lien de connexion n'est généré que pour un profil `is_demo = true`,
 * revérifié en base juste avant l'appel à `generateLink` (jamais de
 * confiance dans la config statique seule) — cf. app/api/admin/demo-accounts.
 */
import 'server-only'
import { generateUniquePartnerCode } from '@/lib/utils/partner-code'
import type { Database } from '@/types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

type AdminClient = SupabaseClient<Database>

export type DemoRoleKey =
  | 'cooperative_admin'
  | 'member'
  | 'ouvrier'
  | 'acheteur'
  | 'agronome'
  | 'operator_candidate'

interface DemoRoleConfig {
  key: DemoRoleKey
  email: string
  firstName: string
  lastName: string
  label: string
  description: string
}

const DEMO_COOPERATIVE_NAME = 'Coopérative de démonstration'

export const DEMO_ROLES: DemoRoleConfig[] = [
  {
    key: 'cooperative_admin',
    email: 'demo.cooperative_admin@faitierehub.internal',
    firstName: 'Démo',
    lastName: 'Admin coopérative',
    label: 'Administrateur de coopérative',
    description: 'Tableau de bord coopérative complet : membres, cotisations, parcelles.',
  },
  {
    key: 'member',
    email: 'demo.member@faitierehub.internal',
    firstName: 'Démo',
    lastName: 'Membre',
    label: 'Membre',
    description: "Espace membre d'une coopérative de démonstration.",
  },
  {
    key: 'ouvrier',
    email: 'demo.ouvrier@faitierehub.internal',
    firstName: 'Démo',
    lastName: 'Ouvrier',
    label: 'Ouvrier (Haroo)',
    description: 'Espace Haroo côté ouvrier agricole.',
  },
  {
    key: 'acheteur',
    email: 'demo.acheteur@faitierehub.internal',
    firstName: 'Démo',
    lastName: 'Acheteur',
    label: 'Acheteur (Haroo)',
    description: 'Espace Haroo côté acheteur.',
  },
  {
    key: 'agronome',
    email: 'demo.agronome@faitierehub.internal',
    firstName: 'Démo',
    lastName: 'Agronome',
    label: 'Agronome (Haroo)',
    description: 'Espace Haroo côté agronome.',
  },
  {
    key: 'operator_candidate',
    email: 'demo.operateur@faitierehub.internal',
    firstName: 'Démo',
    lastName: 'Candidat Opérateur',
    label: 'Candidat Opérateur (sans organisation)',
    description:
      'Compte sans couche organisationnelle ni Haroo — le cas que la formation AgriAcademy V2 (Opérateur certifié) doit couvrir. Accède à /operator et /operator/training.',
  },
]

export interface DemoAccountStatus {
  key: DemoRoleKey
  email: string
  label: string
  description: string
  exists: boolean
}

async function ensureDemoCooperative(admin: AdminClient): Promise<string> {
  const { data: existing } = await admin
    .from('cooperatives')
    .select('id')
    .eq('is_demo', true)
    .maybeSingle()
  if (existing) return existing.id

  const { data: created, error } = await admin
    .from('cooperatives')
    .insert({ name: DEMO_COOPERATIVE_NAME, level: 'cooperative', is_demo: true })
    .select('id')
    .single()
  if (error || !created) throw new Error('Création de la coopérative de démonstration impossible')
  return created.id
}

/**
 * Crée (si absent) le compte auth + profil pour un rôle de démo, et
 * s'assure que role/haroo_type/cooperative_id/is_demo sont à jour — idempotent,
 * appelable à volonté (ex. après un changement de DEMO_ROLES).
 */
export async function ensureDemoAccount(
  admin: AdminClient,
  config: DemoRoleConfig,
): Promise<{ ok: boolean; error?: string }> {
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', config.email)
    .maybeSingle()

  let profileId = existingProfile?.id

  if (!profileId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: config.email,
      email_confirm: true,
      user_metadata: { first_name: config.firstName, last_name: config.lastName },
    })
    if (error || !created.user) {
      return { ok: false, error: `Création du compte auth impossible (${error?.message})` }
    }
    profileId = created.user.id
  }

  const cooperativeId =
    config.key === 'cooperative_admin' || config.key === 'member'
      ? await ensureDemoCooperative(admin)
      : null

  const role = config.key === 'cooperative_admin' || config.key === 'member' ? config.key : 'none'
  const harooType =
    config.key === 'ouvrier' || config.key === 'acheteur' || config.key === 'agronome'
      ? config.key
      : null

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      role,
      cooperative_id: cooperativeId,
      haroo_type: harooType,
      is_demo: true,
      first_name: config.firstName,
      last_name: config.lastName,
    })
    .eq('id', profileId)
  if (updateError) return { ok: false, error: 'Mise à jour du profil de démo impossible' }

  if (harooType) {
    const table =
      harooType === 'ouvrier'
        ? 'haroo_ouvrier_profiles'
        : harooType === 'acheteur'
          ? 'haroo_acheteur_profiles'
          : 'haroo_agronome_profiles'
    const { data: existingHarooRow } = await admin
      .from(table)
      .select('id')
      .eq('user_id', profileId)
      .maybeSingle()
    if (!existingHarooRow) {
      await admin
        .from(table)
        .insert({ user_id: profileId, first_name: config.firstName, last_name: config.lastName })
    }
  }

  // Le candidat Opérateur a besoin d'un vrai dossier (partners +
  // partner_memberships + partner_certifications) : depuis que la formation
  // est réservée aux Opérateurs (assertOperatorCandidate), un profil nu ne
  // voit plus le parcours et l'aperçu admin ne montrerait rien. Statut
  // 'candidate', certification vide — exactement ce qu'obtient un vrai
  // candidat après /api/account/apply-partner, aucun privilège en plus.
  if (config.key === 'operator_candidate') {
    const { error } = await ensureDemoPartnerDossier(admin, profileId, config)
    if (error) return { ok: false, error }
  }

  return { ok: true }
}

async function ensureDemoPartnerDossier(
  admin: AdminClient,
  profileId: string,
  config: DemoRoleConfig,
): Promise<{ error?: string }> {
  const { data: existing } = await admin
    .from('partner_certifications')
    .select('id')
    .eq('user_id', profileId)
    .not('partner_id', 'is', null)
    .maybeSingle<{ id: string }>()
  if (existing) return {}

  let partnerCode: string
  try {
    partnerCode = await generateUniquePartnerCode(admin, 'XX')
  } catch {
    return { error: 'Génération du code Opérateur de démo impossible' }
  }

  const { data: partner, error: partnerError } = await admin
    .from('partners')
    .insert({
      partner_code: partnerCode,
      display_name: `${config.firstName} ${config.lastName}`.trim(),
      email: config.email,
      status: 'candidate',
    })
    .select('id')
    .single<{ id: string }>()
  if (partnerError || !partner) return { error: 'Création du Partenaire de démo impossible' }

  const { error: membershipError } = await admin.from('partner_memberships').insert({
    partner_id: partner.id,
    user_id: profileId,
    membership_role: 'owner',
    status: 'active',
  })
  const { error: certificationError } = membershipError
    ? { error: membershipError }
    : await admin
        .from('partner_certifications')
        .insert({ user_id: profileId, partner_id: partner.id })

  if (membershipError || certificationError) {
    await admin.from('partners').delete().eq('id', partner.id)
    return { error: 'Création du dossier Opérateur de démo impossible' }
  }

  return {}
}

export async function ensureAllDemoAccounts(
  admin: AdminClient,
): Promise<{ key: DemoRoleKey; ok: boolean; error?: string }[]> {
  const results = []
  for (const config of DEMO_ROLES) {
    const result = await ensureDemoAccount(admin, config)
    results.push({ key: config.key, ...result })
  }
  return results
}

export async function listDemoAccountStatus(admin: AdminClient): Promise<DemoAccountStatus[]> {
  const { data: profiles } = await admin.from('profiles').select('email').eq('is_demo', true)
  const existingEmails = new Set((profiles ?? []).map((p) => p.email))
  return DEMO_ROLES.map((config) => ({
    key: config.key,
    email: config.email,
    label: config.label,
    description: config.description,
    exists: existingEmails.has(config.email),
  }))
}

/**
 * Génère un lien de connexion magique pour un compte de démo. Revérifie
 * `is_demo = true` en base avant tout appel à generateLink — jamais de
 * confiance dans la config statique seule, jamais un compte réel.
 */
export async function generateDemoSignInLink(
  admin: AdminClient,
  key: DemoRoleKey,
  origin: string,
): Promise<{ ok: boolean; error?: string; url?: string }> {
  const config = DEMO_ROLES.find((r) => r.key === key)
  if (!config) return { ok: false, error: 'Rôle de démo inconnu' }

  const { data: profile } = await admin
    .from('profiles')
    .select('id, is_demo, email')
    .eq('email', config.email)
    .maybeSingle()
  if (!profile || !profile.is_demo) {
    return { ok: false, error: "Ce compte n'est pas un compte de démo — initialisez-le d'abord" }
  }

  // Sans `redirectTo` explicite, GoTrue retombe sur le Site URL par défaut du
  // projet (encore réglé sur localhost en dev) et livre les jetons en
  // fragment d'URL au lieu de passer par /auth/callback, qui les échange
  // proprement (exchangeCodeForSession) et route selon le rôle. `origin`
  // vient de request.nextUrl.origin côté route appelante — jamais d'un en-tête
  // spoofable (même règle que app/auth/callback/route.ts).
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: config.email,
    options: { redirectTo: `${origin}/auth/callback` },
  })
  if (error || !data.properties?.action_link) {
    return { ok: false, error: 'Génération du lien impossible' }
  }
  return { ok: true, url: data.properties.action_link }
}
