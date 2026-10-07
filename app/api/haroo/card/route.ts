/**
 * Carte professionnelle Haroo du compte courant, en PNG.
 *
 * GET /api/haroo/card
 *
 * Volontairement sans paramètre d'identité : la carte servie est toujours
 * celle du porteur de la session. Pas d'identifiant en entrée, donc pas de
 * carte d'autrui atteignable en changeant un paramètre d'URL — contrairement
 * à /api/cards/[memberId], qui doit pour cette raison vérifier le
 * rattachement à la coopérative.
 *
 * Le rendu suit la même chaîne que la carte membre : SVG puis rasterisation
 * par @resvg/resvg-wasm.
 */

import { CARD_FONT_FAMILY, loadCardFonts, loadCardLogoDataUrl } from '@/lib/card-engine/fonts'
import { type HarooCardType, renderHarooCardSvg } from '@/lib/card-engine/haroo-card'
import {
  CARD_STATUS_LABEL,
  type ProfessionalType,
  computeCardStatus,
  formatValidUntil,
  isProfessionalVerified,
  professionLabel,
  qualificationFor,
  validatedByLine,
} from '@/lib/professionals/core'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import { type NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const PROFILE_TABLE = {
  ouvrier: 'haroo_ouvrier_profiles',
  acheteur: 'haroo_acheteur_profiles',
  agronome: 'haroo_agronome_profiles',
} as const

const CARD_TYPE: Record<keyof typeof PROFILE_TABLE, HarooCardType & ProfessionalType> = {
  ouvrier: 'OUVRIER',
  acheteur: 'ACHETEUR',
  agronome: 'AGRONOME',
}

let wasmReady = false
async function ensureWasm() {
  if (wasmReady) return
  try {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const buffer = await readFile(
      join(process.cwd(), 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm'),
    )
    await initWasm(buffer)
    wasmReady = true
  } catch (e: unknown) {
    // Rechargement à chaud en développement : le module est déjà initialisé.
    if (e instanceof Error && e.message.includes('Already initialized')) wasmReady = true
    else throw e
  }
}

export async function GET(request: NextRequest) {
  const limit = rateLimit(`haroo-card:${clientKeyFromHeaders(request.headers)}`, 20, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('haroo_type, cooperative_id')
    .eq('id', user.id)
    .maybeSingle<{ haroo_type: string | null; cooperative_id: string | null }>()

  const harooType = profileRow?.haroo_type
  if (!harooType || !(harooType in PROFILE_TABLE)) {
    return NextResponse.json({ error: 'Aucun profil Haroo sur ce compte' }, { status: 404 })
  }
  const key = harooType as keyof typeof PROFILE_TABLE

  // Famille AGRONOME : validation, faîtière et profession pour les mentions
  // de la carte (qualification, « validé par la faîtière », badge).
  const { data: haroo } = await supabase
    .from(PROFILE_TABLE[key])
    .select(
      key === 'agronome'
        ? 'first_name, last_name, card_number, photo_url, badge_valide, statut_validation, faitiere_id, profession'
        : 'first_name, last_name, card_number, photo_url',
    )
    .eq('user_id', user.id)
    .maybeSingle<{
      first_name: string | null
      last_name: string | null
      card_number: string | null
      photo_url: string | null
      badge_valide?: boolean | null
      statut_validation?: string | null
      faitiere_id?: string | null
      profession?: string | null
    }>()

  if (!haroo?.card_number) {
    return NextResponse.json({ error: 'Carte non encore émise pour ce profil' }, { status: 404 })
  }

  // L'organisation n'est affichée que si le compte porte aussi une couche
  // organisationnelle ; un profil Haroo pur reste « Indépendant ».
  let organisation: string | null = null
  if (profileRow?.cooperative_id) {
    const { data: coop } = await supabase
      .from('cooperatives')
      .select('name')
      .eq('id', profileRow.cooperative_id)
      .maybeSingle<{ name: string }>()
    organisation = coop?.name ?? null
  }

  // Jeton de vérification opaque de la carte (si émise après la phase 1).
  // Lecture service_role ciblée : le numéro vient du profil du porteur de la
  // session, jamais d'un paramètre.
  const admin = createAdminClient()
  const { data: cardRow } = await admin
    .from('member_cards')
    .select('verify_token, status, expiry_date, revoked_at, suspended_at')
    .eq('card_number', haroo.card_number)
    .maybeSingle<{
      verify_token: string | null
      status: string
      expiry_date: string | null
      revoked_at: string | null
      suspended_at: string | null
    }>()

  const cardType = CARD_TYPE[key]
  // « PROFIL VÉRIFIÉ » seulement après une vérification réelle : famille
  // AGRONOME validée (badge ET statut VALIDE). Ouvrier / acheteur n'ont pas de
  // circuit de vérification : pas de pastille.
  const verified =
    key === 'agronome' &&
    isProfessionalVerified({
      badge_valide: haroo.badge_valide ?? null,
      statut_validation: haroo.statut_validation ?? null,
    })
  let faitiereName: string | null = null
  if (verified && haroo.faitiere_id) {
    const { data: f } = await admin
      .from('cooperatives')
      .select('name')
      .eq('id', haroo.faitiere_id)
      .maybeSingle<{ name: string | null }>()
    faitiereName = f?.name ?? null
  }

  const svg = renderHarooCardSvg(
    {
      type: cardType,
      firstName: haroo.first_name ?? '',
      lastName: haroo.last_name ?? '',
      cardNumber: haroo.card_number,
      organisation,
      photoUrl: haroo.photo_url,
      verifyToken: cardRow?.verify_token ?? null,
      professionLabel: professionLabel(cardType, haroo.profession),
      verified,
      qualification: qualificationFor(cardType, haroo.profession, verified),
      statusLabel: cardRow ? CARD_STATUS_LABEL[computeCardStatus(cardRow)] : null,
      validUntil: formatValidUntil(cardRow?.expiry_date),
      validatedBy: validatedByLine(verified, faitiereName),
    },
    null,
    await loadCardLogoDataUrl(),
  )

  await ensureWasm()
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: 2360 },
    font: {
      fontBuffers: await loadCardFonts(),
      defaultFontFamily: CARD_FONT_FAMILY,
      loadSystemFonts: false,
    },
  })
    .render()
    .asPng()

  return new NextResponse(png, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="carte-${haroo.card_number}.png"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
