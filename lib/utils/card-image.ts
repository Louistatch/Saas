/**
 * Cartes de membre côté navigateur : schéma, PNG, PDF, niveaux.
 *
 * Pont entre les données du tableau de bord (carte, coopératives, modèle
 * enregistré) et le moteur `lib/card-engine`. Un seul chemin construit le
 * schéma d'une carte : aperçu, téléchargement, PDF et feuille A4 affichent donc
 * le même dessin, avec la même identité (logo, couleur, lignée).
 */

import {
  type BrandingOrg,
  type BrandingTemplate,
  type CardLevel,
  type CardSchema,
  buildCardSchema,
  inlineImage,
  renderCardCanvas,
  renderToPng,
  resolveCardBranding,
  triggerDownload,
} from '@/lib/card-engine'
import { type CardPdfOptions, buildCardPdf } from '@/lib/card-engine/pdf'
import { getMemberScore } from '@/lib/members/score'
import type { Cooperative, MemberCard } from '@/types/domain'

/** Coopératives du contexte → organisations de la lignée. */
export function toBrandingOrgs(cooperatives: ReadonlyArray<Cooperative>): BrandingOrg[] {
  return cooperatives.map((c) => ({
    id: c.id,
    name: c.name,
    level: c.level ?? null,
    parentId: c.parentId ?? null,
    logoUrl: c.logo ?? null,
    primaryColor: c.primaryColor ?? null,
    faitiereName: c.faitiereName ?? null,
  }))
}

export interface CardImageContext {
  card: MemberCard
  /** Organisations connues (au moins la lignée de la carte). */
  orgs: ReadonlyArray<BrandingOrg>
  /** Organisation de repli quand `card.cooperative_id` est inconnue de `orgs`. */
  fallbackOrganisationId?: string | null
  /**
   * Modèles ENREGISTRÉS, par organisation. Ne pas y mettre le modèle par
   * défaut d'un formulaire jamais enregistré : il masquerait la couleur de
   * l'organisation.
   */
  savedTemplates?: Readonly<Record<string, BrandingTemplate | null | undefined>>
  level?: CardLevel | null
}

/** Logos intégrés (data URL) et leurs proportions, par URL d'origine. */
export type LogoAssets = ReadonlyMap<string, { dataUrl: string; aspect: number | null }>

/**
 * Télécharge et mesure les logos distincts des organisations qui apparaissent
 * sur ces cartes. Sans cette mesure, un logotype large serait traité comme un
 * logo carré et illisible dans le sceau.
 */
export async function loadLogoAssets(
  contexts: ReadonlyArray<CardImageContext>,
): Promise<LogoAssets> {
  const urls = new Set<string>()
  for (const ctx of contexts) {
    const b = schemaForCard(ctx).branding
    if (b.cooperativeLogoUrl) urls.add(b.cooperativeLogoUrl)
    if (b.faitiereLogoUrl) urls.add(b.faitiereLogoUrl)
  }
  const entries = await Promise.all(
    [...urls].map(async (url) => [url, await inlineImage(url, { maxBytes: 512_000 })] as const),
  )
  const assets = new Map<string, { dataUrl: string; aspect: number | null }>()
  for (const [url, image] of entries) if (image) assets.set(url, image)
  return assets
}

/** Schéma de rendu d'une carte du tableau de bord. */
export function schemaForCard(ctx: CardImageContext, assets?: LogoAssets): CardSchema {
  const { card } = ctx
  const branding =
    resolveCardBranding({
      organisationId: card.cooperative_id,
      orgs: ctx.orgs,
      templates: ctx.savedTemplates,
    }) ??
    (ctx.fallbackOrganisationId
      ? resolveCardBranding({
          organisationId: ctx.fallbackOrganisationId,
          orgs: ctx.orgs,
          templates: ctx.savedTemplates,
        })
      : null)

  const coopAsset = branding?.cooperativeLogoUrl
    ? assets?.get(branding.cooperativeLogoUrl)
    : undefined
  const faitiereAsset = branding?.faitiereLogoUrl
    ? assets?.get(branding.faitiereLogoUrl)
    : undefined

  return buildCardSchema({
    member: {
      first_name: card.member?.first_name ?? '',
      last_name: card.member?.last_name ?? '',
      phone: card.member?.phone,
      photo_url: card.member?.photo_url,
      signature_url: card.member?.signature_url,
      village: card.member?.village,
      canton: card.member?.canton,
      prefecture: card.member?.prefecture,
      region: card.member?.region,
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
    faitiereLogoUrl: faitiereAsset?.dataUrl ?? branding?.faitiereLogoUrl,
    faitiereLogoAspect: faitiereAsset?.aspect,
    cooperativeLogoUrl: coopAsset?.dataUrl ?? branding?.cooperativeLogoUrl,
    cooperativeLogoAspect: coopAsset?.aspect,
    brandColor: branding?.brandColor,
    accentColor: branding?.accentColor,
    level: ctx.level ?? null,
    template: branding?.template,
  })
}

/** PNG numérique de la carte (face unique). */
export async function renderCardImage(ctx: CardImageContext): Promise<Blob> {
  return renderToPng(schemaForCard(ctx))
}

export async function downloadCardImage(ctx: CardImageContext, filename?: string): Promise<void> {
  const blob = await renderCardImage(ctx)
  triggerDownload(blob, filename ?? `carte-membre-${ctx.card.card_number}.png`)
}

function canvasPng(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}

/**
 * PDF prêt à imprimer : une page par carte, de 85,6 × 54 mm (91,6 × 60 avec
 * fond perdu), carte à 600 ppp.
 */
export async function renderCardPdf(
  contexts: ReadonlyArray<CardImageContext>,
  opts: Pick<CardPdfOptions, 'bleed' | 'marks'> = {},
): Promise<Blob> {
  const bleed = Boolean(opts.bleed || opts.marks)
  const pages: string[] = []
  for (const ctx of contexts) {
    const canvas = await renderCardCanvas(schemaForCard(ctx), { mode: 'print', bleed, scale: 2 })
    pages.push(canvasPng(canvas))
  }
  const bytes = await buildCardPdf(pages, { bleed, marks: opts.marks, title: 'Cartes de membre' })
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

export async function downloadCardPdf(
  contexts: ReadonlyArray<CardImageContext>,
  filename: string,
  opts: Pick<CardPdfOptions, 'bleed' | 'marks'> = {},
): Promise<void> {
  triggerDownload(await renderCardPdf(contexts, opts), filename)
}

const LEVELS: Record<string, CardLevel> = { Or: 'or', Argent: 'argent', Bronze: 'bronze' }

/**
 * Niveau réel des membres (fonction SQL get_member_score). Avant, la carte
 * imprimait « Bronze » pour tout le monde, d'après le rang de l'organisation.
 * Un membre sans niveau (ou une erreur) reste absent du résultat : la carte
 * affiche alors « — », jamais un niveau inventé.
 */
export async function loadMemberLevels(
  memberIds: ReadonlyArray<string>,
  concurrency = 6,
): Promise<Map<string, CardLevel>> {
  const ids = [...new Set(memberIds)]
  const levels = new Map<string, CardLevel>()
  let cursor = 0
  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++]
      try {
        const score = await getMemberScore(id)
        const level = score.level ? LEVELS[score.level] : undefined
        if (level) levels.set(id, level)
      } catch {
        // Niveau inconnu : champ « — » sur la carte.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker))
  return levels
}
