/**
 * Carte de membre en PNG ou en PDF, générée côté serveur. La carte n'a qu'une
 * face : une image, ou un PDF d'une page.
 *
 * GET /api/cards/:memberId
 *   ?format=png|pdf        pdf : une page de 85,6 × 54 mm
 *   &bleed=1               fond perdu de 3 mm (page de 91,6 × 60 mm)
 *   &marks=1               repères de coupe (PDF, implique le fond perdu)
 *   &dpi=300|600           résolution (défaut : 600)
 *
 * Même dessin que l'aperçu du tableau de bord (lib/card-engine/member-card.ts),
 * rasterisé par @resvg/resvg-wasm avec les polices embarquées.
 *
 * Auth : utilisateur authentifié ayant accès à la coopérative de la carte.
 */

import {
  type BrandingOrg,
  buildCardSchema,
  inlineCardImages,
  renderCardSvg,
} from '@/lib/card-engine'
import { type BrandingTemplate, resolveCardBranding } from '@/lib/card-engine/branding'
import {
  MEMBER_CARD_FONT_FAMILY,
  loadCardLogoDataUrl,
  loadMemberCardFonts,
} from '@/lib/card-engine/fonts'
import { BASE_PX, BLEED, TRIM_W } from '@/lib/card-engine/member-card'
import { buildCardPdf } from '@/lib/card-engine/pdf'
import { assertTenantAccess } from '@/lib/security/assert-access'
import { createClient } from '@/lib/supabase/server'
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const flag = z
  .enum(['0', '1', 'true', 'false'])
  .optional()
  .transform((v) => v === '1' || v === 'true')

const querySchema = z.object({
  format: z.enum(['png', 'pdf']).default('png'),
  bleed: flag,
  marks: flag,
  dpi: z.enum(['300', '600']).default('600'),
})

interface OrgRow {
  id: string
  name: string
  level: string | null
  parent_id: string | null
  logo_url: string | null
  primary_color: string | null
  faitiere_name: string | null
}

/**
 * Seules les images hébergées sur le stockage du projet sont téléchargées : une
 * `logo_url` ou une `photo_url` saisie par un utilisateur ne doit pas pouvoir
 * faire joindre un hôte interne par le serveur.
 */
function allowedImageUrl(url: string): boolean {
  try {
    const target = new URL(url)
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (target.protocol !== 'https:' || !base) return false
    return target.hostname === new URL(base).hostname
  } catch {
    return false
  }
}

// Initialize WASM once (singleton pattern for serverless)
let wasmInitialized = false
async function ensureWasm() {
  if (wasmInitialized) return
  try {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const wasmPath = join(process.cwd(), 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm')
    await initWasm(await readFile(wasmPath))
    wasmInitialized = true
  } catch (e: unknown) {
    // Already initialized (hot reload in dev)
    if (e instanceof Error && e.message.includes('Already initialized')) {
      wasmInitialized = true
    } else {
      throw e
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const { memberId } = await params

  if (!memberId || memberId.length < 10) {
    return NextResponse.json({ error: 'Invalid member ID' }, { status: 400 })
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
  }
  const query = parsed.data

  const supabase = await createClient()

  // Verify the user is authenticated
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  // Fetch the active member card for this member (les cartes Haroo partagent la table)
  const { data: card, error: cardError } = await supabase
    .from('member_cards')
    .select('card_number, status, expiry_date, created_at, cooperative_id, member_id')
    .eq('member_id', memberId)
    .eq('card_type', 'FAITIERE')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cardError || !card) {
    return NextResponse.json({ error: 'Carte active introuvable pour ce membre' }, { status: 404 })
  }

  // SEC-05: verify the caller actually has access to this card's cooperative.
  // Authentication alone is insufficient — any admin could otherwise render the
  // PNG of a member in a cooperative they don't belong to.
  const tenant = await assertTenantAccess(card.cooperative_id)
  if (!tenant.ok) return tenant.response

  // Fetch member details
  const { data: member } = await supabase
    .from('members')
    .select(
      'first_name, last_name, phone, photo_url, signature_url, village, canton, prefecture, region',
    )
    .eq('id', memberId)
    .maybeSingle()

  if (!member) {
    return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 })
  }

  // Lignée de la coopérative (coopérative → union → faîtière). La boucle est
  // bornée : un cycle de parent_id ne doit pas pouvoir bloquer la requête.
  const lineage: OrgRow[] = []
  let nextId: string | null = card.cooperative_id
  for (let depth = 0; depth < 6 && nextId; depth++) {
    const { data: org }: { data: OrgRow | null } = await supabase
      .from('cooperatives')
      .select('id, name, level, parent_id, logo_url, primary_color, faitiere_name')
      .eq('id', nextId)
      .maybeSingle()
    if (!org || lineage.some((o) => o.id === org.id)) break
    lineage.push(org)
    nextId = org.parent_id
  }

  // Modèle enregistré (cooperative_settings), le plus proche de la coopérative l'emporte.
  const { data: settingsRows } = await supabase
    .from('cooperative_settings')
    .select('cooperative_id, card_template')
    .in(
      'cooperative_id',
      lineage.map((o) => o.id),
    )
  const templates: Record<string, BrandingTemplate | null> = {}
  for (const row of (settingsRows ?? []) as {
    cooperative_id: string
    card_template: BrandingTemplate | null
  }[]) {
    templates[row.cooperative_id] = row.card_template
  }

  const orgs: BrandingOrg[] = lineage.map((o) => ({
    id: o.id,
    name: o.name,
    level: o.level,
    parentId: o.parent_id,
    logoUrl: o.logo_url,
    primaryColor: o.primary_color,
    faitiereName: o.faitiere_name,
  }))
  const branding = resolveCardBranding({
    organisationId: card.cooperative_id,
    orgs,
    templates,
  })

  // Niveau réel (get_member_score) : l'ancien code lisait le rang de
  // l'organisation (coop.level), si bien que toute carte sortait « Bronze ».
  const { data: scoreData } = await supabase.rpc('get_member_score', { target_member_id: memberId })
  const scoreLevel = (scoreData as { level?: string | null } | null)?.level
  const level =
    scoreLevel === 'Or'
      ? 'or'
      : scoreLevel === 'Argent'
        ? 'argent'
        : scoreLevel === 'Bronze'
          ? 'bronze'
          : null

  const base = buildCardSchema({
    member: {
      first_name: member.first_name,
      last_name: member.last_name,
      phone: member.phone,
      photo_url: member.photo_url,
      signature_url: member.signature_url,
      village: member.village,
      canton: member.canton,
      prefecture: member.prefecture,
      region: member.region,
    },
    cardNumber: card.card_number,
    expiryDate: card.expiry_date,
    createdAt: card.created_at,
    status: card.status,
    cooperativeName: branding?.cooperativeName ?? '',
    organisationId: branding?.organisationId ?? card.cooperative_id,
    organisationLevel: branding?.organisationLevel,
    unionName: branding?.unionName,
    faitiereName: branding?.faitiereName,
    faitiereLogoUrl: branding?.faitiereLogoUrl,
    cooperativeLogoUrl: branding?.cooperativeLogoUrl,
    brandColor: branding?.brandColor,
    accentColor: branding?.accentColor,
    level,
    template: branding?.template,
  })
  // resvg n'a pas de pile réseau : photo, signature et logos sont intégrés avant le rendu.
  const [{ schema, photoDataUrl }, platformLogo] = await Promise.all([
    inlineCardImages(base, { allowUrl: allowedImageUrl }),
    loadCardLogoDataUrl(),
  ])

  await ensureWasm()
  const fontBuffers = await loadMemberCardFonts()
  const scale = query.dpi === '600' ? 2 : 1
  const bleed = query.bleed || query.marks
  const unitsW = TRIM_W + (bleed ? BLEED * 2 : 0)
  const widthPx = Math.round(unitsW * (BASE_PX / TRIM_W) * scale)

  const rasterize = (): Uint8Array => {
    const svg = renderCardSvg(schema, {
      mode: 'print',
      bleed,
      photoDataUrl,
      platformLogo,
      intrinsicSize: true,
      // resvg reçoit les polices directement (fontBuffers) : aucune règle @font-face.
      fontCss: null,
    })
    return new Resvg(svg, {
      fitTo: { mode: 'width', value: widthPx },
      // Sans buffer de police, resvg-wasm rend les <text> vides.
      font: {
        fontBuffers,
        defaultFontFamily: MEMBER_CARD_FONT_FAMILY,
        loadSystemFonts: false,
      },
    })
      .render()
      .asPng()
  }

  if (query.format === 'pdf') {
    const pdf = await buildCardPdf([rasterize()], {
      bleed,
      marks: query.marks,
      title: `Carte de membre ${card.card_number}`,
    })
    return new NextResponse(pdf as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="carte-${card.card_number}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }

  const png = rasterize()
  return new NextResponse(png as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="carte-${card.card_number}.png"`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
