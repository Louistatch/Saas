// Candidature à la certification Opérateur/Partenaire.
//
// Contrairement à l'activation Haroo, ceci ne pose AUCUN privilège : le
// statut initial 'candidate' n'ouvre aucun accès délégué, aucun mandat sur
// une organisation, aucune facturation (§25 du plan — l'activation de
// privilège reste serveur, après certification/approbation, jamais ici).
// Cette route ne fait qu'ouvrir le dossier : elle crée l'entité `partners`,
// y rattache le compte comme `owner`, et pose une ligne `partner_certifications`
// vide que la formation (AgriAcademy) et l'examen viendront compléter.
//
// Un compte existant peut se porter candidat directement — pas de second
// email, pas de second compte (§24).

import { getAccessContext } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { generateUniquePartnerCode, prefectureCode } from '@/lib/utils/partner-code'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
  display_name: z.string().trim().min(2).max(120),
  business_name: z.string().trim().max(160).optional(),
  phone: z.string().trim().min(8).max(40).optional(),
  region_id: z.string().uuid().optional(),
  prefecture_id: z.string().uuid().optional(),
})

export async function POST(request: NextRequest) {
  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`apply-partner:${ip}`, 5, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }

  const ctx = await getAccessContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Formulaire de candidature invalide' }, { status: 400 })
  }
  const { display_name, business_name, phone, region_id, prefecture_id } = parsed.data

  const { supabase, userId } = ctx

  // Idempotence : un compte ne peut avoir qu'une seule certification en
  // cours. Une seconde candidature réécrirait silencieusement la première.
  const { data: existing } = await supabase
    .from('partner_certifications')
    .select('id, partner_id')
    .eq('user_id', userId)
    .maybeSingle<{ id: string; partner_id: string | null }>()

  if (existing) {
    return NextResponse.json(
      { error: 'Une candidature Opérateur existe déjà pour ce compte', already_applied: true },
      { status: 409 },
    )
  }

  // Ces trois écritures sont privilégiées (RLS: service_role uniquement —
  // le statut d'un Partenaire n'est pas une préférence de profil, cf. la
  // migration). La route fait l'autorisation en amont ; l'admin client
  // n'écrit jamais que pour ctx.userId.
  const admin = createAdminClient()

  let prefName: string | null = null
  if (prefecture_id) {
    const { data: pref } = await admin
      .from('prefectures')
      .select('name')
      .eq('id', prefecture_id)
      .maybeSingle<{ name: string }>()
    prefName = pref?.name ?? null
  }

  const partnerCode = await generateUniquePartnerCode(admin, prefectureCode(prefName))

  const { data: partner, error: partnerError } = await admin
    .from('partners')
    .insert({
      partner_code: partnerCode,
      display_name,
      business_name: business_name ?? null,
      phone: phone ?? null,
      email: null, // renseigné depuis profiles côté lecture, pas dupliqué ici
      region_id: region_id ?? null,
      prefecture_id: prefecture_id ?? null,
      status: 'candidate',
    })
    .select('id, partner_code, status')
    .single<{ id: string; partner_code: string; status: string }>()

  if (partnerError || !partner) {
    return NextResponse.json({ error: 'Création de la candidature impossible' }, { status: 502 })
  }

  const { error: membershipError } = await admin.from('partner_memberships').insert({
    partner_id: partner.id,
    user_id: userId,
    membership_role: 'owner',
    status: 'active',
  })

  if (membershipError) {
    // Le Partenaire vient d'être créé mais personne n'y est rattaché : on le
    // retire plutôt que de laisser une entité orpheline qu'aucun compte ne
    // peut plus voir (la policy RLS de lecture passe par la ligne membership).
    await admin.from('partners').delete().eq('id', partner.id)
    return NextResponse.json({ error: 'Candidature impossible' }, { status: 502 })
  }

  const { error: certError } = await admin.from('partner_certifications').insert({
    user_id: userId,
    partner_id: partner.id,
  })

  if (certError) {
    await admin
      .from('partner_memberships')
      .delete()
      .eq('partner_id', partner.id)
      .eq('user_id', userId)
    await admin.from('partners').delete().eq('id', partner.id)
    return NextResponse.json({ error: 'Candidature impossible' }, { status: 502 })
  }

  return NextResponse.json({
    success: true,
    partner_id: partner.id,
    partner_code: partner.partner_code,
    status: partner.status,
  })
}
