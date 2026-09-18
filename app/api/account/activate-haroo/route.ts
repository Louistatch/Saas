// Activation de la couche Haroo sur un compte existant.
//
// Un compte porte deux couches indépendantes : `profiles.role` pour la couche
// organisationnelle (coopératives) et `profiles.haroo_type` pour la couche
// Haroo. Cette route pose la seconde sans jamais toucher à la première — c'est
// précisément ce qui permet à un membre de coopérative d'être aussi ouvrier.
//
// La carte professionnelle vérifiable par QR n'est PAS émise ici : elle reste
// délivrée par le super_admin via /admin/haroo, après contrôle du profil (cf.
// supabase/migrations/20260612_090000_haroo_cards.sql). Auto-générer la carte
// viderait de son sens le badge « Vérifié » du scanner public.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAccessContext } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, clientKeyFromHeaders } from '@/lib/utils/rate-limit'
import { HAROO_TYPES, type HarooType } from '@/types/domain'

const PROFILE_TABLES: Record<HarooType, string> = {
  ouvrier: 'haroo_ouvrier_profiles',
  acheteur: 'haroo_acheteur_profiles',
  agronome: 'haroo_agronome_profiles',
}

const bodySchema = z.object({
  haroo_type: z.enum(HAROO_TYPES),
  phone: z.string().trim().min(8).max(40).optional(),
})

export async function POST(request: NextRequest) {
  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`activate-haroo:${ip}`, 5, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }

  const ctx = await getAccessContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Idempotence : ne jamais réécrire une couche déjà posée, sinon un second
  // appel changerait le métier du compte et orphelinerait son profil actuel.
  if (ctx.harooType) {
    return NextResponse.json(
      { error: 'La couche Haroo est déjà activée sur ce compte', haroo_type: ctx.harooType },
      { status: 409 },
    )
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Type de profil Haroo invalide' }, { status: 400 })
  }
  const { haroo_type, phone } = parsed.data

  const { supabase, userId } = ctx

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', userId)
    .single<{ first_name: string | null; last_name: string | null }>()

  const firstName = profile?.first_name?.trim()
  const lastName = profile?.last_name?.trim()
  if (!firstName || !lastName) {
    return NextResponse.json(
      { error: 'Renseignez votre prénom et votre nom avant d\'activer Haroo' },
      { status: 422 },
    )
  }

  const table = PROFILE_TABLES[haroo_type]

  // Les tables haroo_* n'ouvrent aux utilisateurs que la lecture et la mise à
  // jour de leur propre ligne — aucune policy INSERT. L'écriture passe donc
  // par le client service_role, comme le reste de ces tables. C'est cette
  // route qui fait l'autorisation : elle n'écrit jamais que pour ctx.userId,
  // jamais pour un identifiant venu du corps de la requête.
  const admin = createAdminClient()

  // Le profil métier d'abord : s'il échoue, le compte reste inchangé. Poser
  // haroo_type en premier laisserait un compte marqué Haroo sans profil, que
  // l'espace /haroo afficherait vide.
  const { error: profileError } = await admin.from(table).insert({
    user_id: userId,
    first_name: firstName,
    last_name: lastName,
    ...(phone ? { phone } : {}),
  })

  if (profileError) {
    return NextResponse.json(
      { error: 'Création du profil Haroo impossible' },
      { status: 502 },
    )
  }

  const { error: layerError } = await admin
    .from('profiles')
    .update({ haroo_type, haroo_activated_at: new Date().toISOString() })
    .eq('id', userId)

  if (layerError) {
    // Le profil métier vient d'être créé mais la couche n'est pas posée :
    // on le retire pour ne pas laisser de ligne orpheline qu'une seconde
    // tentative ferait échouer sur la contrainte d'unicité.
    await admin.from(table).delete().eq('user_id', userId)
    return NextResponse.json(
      { error: 'Activation impossible' },
      { status: 502 },
    )
  }

  return NextResponse.json({
    success: true,
    haroo_type,
    // Le client doit rafraîchir sa session : les claims du JWT sont un miroir
    // de profiles et resteraient périmés jusqu'au prochain renouvellement.
    refresh_required: true,
    card_pending: true,
  })
}
