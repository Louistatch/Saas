// L'acteur courant vu par HarooLife : identité publique, rôles réels, organisations,
// compétences, disponibilité, cartes existantes. Lecture seule, compte requis. Aucune
// donnée de contact ne sort d'ici ; le nom public est « Prénom I. » ou le nom choisi.
import { type Actor, type CardRef, type OrgRef, publicName } from '@/lib/haroolife/domain/actor'
import type { Role, World } from '@/lib/haroolife/world'
import { computeCardStatus } from '@/lib/professionals/core'
import { getAccessContext } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

type CoopRow = {
  id: string
  name: string
  level: string | null
  parent_id: string | null
  logo_url: string | null
}
const toOrg = (c: CoopRow): OrgRef => ({
  id: c.id,
  name: c.name,
  level:
    c.level === 'faitiere' || c.level === 'union' || c.level === 'cooperative' ? c.level : null,
  parentId: c.parent_id,
  logoUrl: c.logo_url,
})

export async function GET() {
  if (process.env.HAROOLIFE_ENABLED !== 'true')
    return NextResponse.json({ error: 'HarooLife est en préparation.' }, { status: 503, headers })
  const ctx = await getAccessContext({ allowVisitor: true })
  if (!ctx) return NextResponse.json({ error: 'Connexion requise' }, { status: 401, headers })
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, first_name, last_name, role, haroo_type, cooperative_id')
    .eq('id', ctx.userId)
    .maybeSingle<{
      id: string
      email: string | null
      first_name: string | null
      last_name: string | null
      role: string
      haroo_type: string | null
      cooperative_id: string | null
    }>()
  if (!profile) return NextResponse.json({ error: 'Profil requis' }, { status: 403, headers })

  // Rôles et résidence : la fonction existante du monde (jamais déclarés par le client).
  const { data: world } = await ctx.supabase.rpc('haroolife_world')
  const me = (world as World | null)?.me ?? null
  const roles = (me?.roles ?? []) as Role[]

  // Organisations : la coopérative du compte et celles où la personne est membre (par e-mail).
  // A HarooLife visitor has no e-mail, hence no membership.
  const { data: memberRows } = profile.email
    ? await admin
        .from('members')
        .select('id, cooperative_id, canton_id, cantons(name)')
        .ilike('email', profile.email)
        .is('deleted_at', null)
        .limit(10)
    : { data: [] }
  const members = (memberRows ?? []) as unknown as {
    id: string
    cooperative_id: string
    canton_id: string | null
    cantons: { name: string } | null
  }[]
  const orgIds = new Set<string>()
  if (profile.cooperative_id) orgIds.add(profile.cooperative_id)
  for (const m of members) orgIds.add(m.cooperative_id)
  const orgs = new Map<string, OrgRef>()
  let frontier = [...orgIds]
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    const { data } = await admin
      .from('cooperatives')
      .select('id, name, level, parent_id, logo_url')
      .in('id', frontier)
      .is('deleted_at', null)
    const rows = (data ?? []) as CoopRow[]
    frontier = []
    for (const c of rows) {
      if (orgs.has(c.id)) continue
      orgs.set(c.id, toOrg(c))
      if (c.parent_id && !orgs.has(c.parent_id)) frontier.push(c.parent_id)
    }
  }
  const organizations = [...orgIds].map((id) => orgs.get(id)).filter((o): o is OrgRef => Boolean(o))
  // Parents are affiliations too (an union member sees its federation), listed after.
  for (const o of orgs.values()) if (!orgIds.has(o.id)) organizations.push(o)

  let administers: string[] = []
  if (profile.role === 'super_admin') administers = ['*']
  else if (profile.role === 'cooperative_admin') {
    const { data } = await ctx.supabase.rpc('get_accessible_cooperative_ids')
    administers = ((data as string[] | null) ?? []).slice(0, 500)
  }

  // Couche Haroo : compétences, disponibilité, validation, carte professionnelle.
  let skills: string[] = []
  let availability: Actor['availability'] = 'unknown'
  let validated = false
  const cards: CardRef[] = []
  const harooType = (profile.haroo_type as Actor['harooType']) ?? null
  if (harooType === 'ouvrier') {
    const { data } = await admin
      .from('haroo_ouvrier_profiles')
      .select('competences, disponible, card_number')
      .eq('user_id', profile.id)
      .maybeSingle<{ competences: string[]; disponible: boolean; card_number: string | null }>()
    if (data) {
      skills = data.competences ?? []
      availability = data.disponible ? 'available' : 'unavailable'
      cards.push({
        kind: 'haroo',
        number: data.card_number,
        status: data.card_number ? 'ACTIVE' : 'NONE',
        verifyPath: data.card_number ? `/verify/${data.card_number}` : null,
        validUntil: null,
      })
    }
  } else if (harooType === 'agronome') {
    const { data } = await admin
      .from('haroo_agronome_profiles')
      .select('badge_valide, statut_validation, card_number, specialisations')
      .eq('user_id', profile.id)
      .maybeSingle<{
        badge_valide: boolean
        statut_validation: string
        card_number: string | null
        specialisations: string[]
      }>()
    if (data) {
      validated = data.badge_valide || data.statut_validation === 'VALIDE'
      skills = data.specialisations ?? []
      cards.push({
        kind: 'haroo',
        number: data.card_number,
        status: validated && data.card_number ? 'ACTIVE' : data.card_number ? 'SUSPENDED' : 'NONE',
        verifyPath: data.card_number ? `/verify/${data.card_number}` : null,
        validUntil: null,
      })
    }
  } else if (harooType === 'acheteur') {
    const { data } = await admin
      .from('haroo_acheteur_profiles')
      .select('card_number')
      .eq('user_id', profile.id)
      .maybeSingle<{ card_number: string | null }>()
    if (data)
      cards.push({
        kind: 'haroo',
        number: data.card_number,
        status: data.card_number ? 'ACTIVE' : 'NONE',
        verifyPath: data.card_number ? `/verify/${data.card_number}` : null,
        validUntil: null,
      })
  }
  // Cartes de membre existantes (système FaîtiereHub) : statut calculé par la règle commune.
  let parcelIds: string[] = []
  if (members.length) {
    const ids = members.map((m) => m.id)
    const { data: cardRows } = await admin
      .from('member_cards')
      .select('card_number, status, expiry_date, revoked_at')
      .in('member_id', ids)
      .is('deleted_at', null)
      .limit(10)
    for (const c of (cardRows ?? []) as {
      card_number: string
      status: string
      expiry_date: string | null
      revoked_at: string | null
    }[])
      cards.push({
        kind: 'member',
        number: c.card_number,
        status: computeCardStatus(c),
        verifyPath: `/verify/${c.card_number}`,
        validUntil: c.expiry_date,
      })
    const { data: parcels } = await admin
      .from('parcelles')
      .select('id')
      .in('member_id', ids)
      .limit(200)
    parcelIds = ((parcels ?? []) as { id: string }[]).map((p) => p.id)
  }
  const canton = me?.home
    ? { id: me.home.canton_id, name: me.home.canton }
    : members[0]?.canton_id
      ? { id: members[0].canton_id, name: members[0].cantons?.name ?? '' }
      : null
  const actor: Actor = {
    id: profile.id,
    displayName: me?.display_name ?? publicName(profile.first_name, profile.last_name),
    roles,
    harooType,
    validated,
    organizations,
    administers,
    canton,
    skills,
    availability,
    visible: me?.visible ?? false,
    cards,
    parcelIds,
  }
  return NextResponse.json(actor, { headers })
}
