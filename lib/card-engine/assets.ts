/**
 * Images de la carte (logos, photo) rendues autonomes.
 *
 * Un SVG rasterisé (canvas via <img>, ou resvg) ne peut pas suivre une URL
 * distante : une image externe disparaît silencieusement de l'export, ou salit
 * le canvas. On les convertit donc en data URL avant le rendu, côté navigateur
 * comme côté serveur, et on mesure au passage leurs proportions.
 */

import { CARD_FONT_FACES, CARD_FONT_PUBLIC_PATH, cardFontFaceCss } from './card-fonts'
import { imageAspectFromDataUrl } from './image-size'
import type { CardSchema } from './schema'

export interface InlinedImage {
  dataUrl: string
  /** Largeur / hauteur ; `null` si le format n'a pas pu être lu. */
  aspect: number | null
}

const DEFAULT_MAX_BYTES = 1_500_000
const DEFAULT_TIMEOUT_MS = 6_000

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

/**
 * Télécharge une image et la renvoie en data URL. Une image illisible, trop
 * lourde ou qui n'est pas une image dégrade la carte (sans logo, sans photo),
 * jamais l'export entier : renvoie `null`.
 */
export async function inlineImage(
  url: string | null | undefined,
  opts: { maxBytes?: number; timeoutMs?: number; allowUrl?: (url: string) => boolean } = {},
): Promise<InlinedImage | null> {
  if (!url) return null
  const { maxBytes = DEFAULT_MAX_BYTES, timeoutMs = DEFAULT_TIMEOUT_MS, allowUrl } = opts
  if (url.startsWith('data:')) {
    return { dataUrl: url, aspect: imageAspectFromDataUrl(url) }
  }
  // Sur le serveur, `allowUrl` borne les hôtes joignables : une URL saisie par
  // un utilisateur ne doit pas pouvoir viser le réseau interne.
  if (allowUrl && !allowUrl(url)) return null
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) return null
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!type.startsWith('image/')) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return null
    const dataUrl = `data:${type};base64,${toBase64(bytes)}`
    return { dataUrl, aspect: imageAspectFromDataUrl(dataUrl) }
  } catch {
    return null
  }
}

/** Schéma dont les images sont intégrées, prêt pour un rendu raster. */
export interface InlinedCard {
  schema: CardSchema
  photoDataUrl: string | null
}

/**
 * Intègre la photo, la signature et les logos d'un schéma (data URL) et
 * mesure les logos. Une image absente ou illisible est retirée : la carte
 * retombe sur son état « sans photo », « sans signature » (ligne vierge) ou
 * « sans logo », qui est un état dessiné.
 */
export async function inlineCardImages(
  schema: CardSchema,
  opts: { allowUrl?: (url: string) => boolean } = {},
): Promise<InlinedCard> {
  const { allowUrl } = opts
  const [photo, signature, coop, faitiere] = await Promise.all([
    inlineImage(schema.member.photoUrl, { allowUrl }),
    inlineImage(schema.member.signatureUrl, { maxBytes: 512_000, allowUrl }),
    inlineImage(schema.branding.cooperativeLogoUrl, { maxBytes: 512_000, allowUrl }),
    inlineImage(schema.branding.faitiereLogoUrl, { maxBytes: 512_000, allowUrl }),
  ])
  return {
    photoDataUrl: photo?.dataUrl ?? null,
    schema: {
      ...schema,
      member: { ...schema.member, signatureUrl: signature?.dataUrl ?? null },
      branding: {
        ...schema.branding,
        cooperativeLogoUrl: coop?.dataUrl ?? null,
        cooperativeLogoAspect: coop?.aspect ?? null,
        faitiereLogoUrl: faitiere?.dataUrl ?? null,
        faitiereLogoAspect: faitiere?.aspect ?? null,
      },
    },
  }
}

/** Logo officiel FaîtiereHub, servi par l'application (public/logo.png). */
export const PLATFORM_LOGO_PATH = '/logo.png'

let platformLogo: Promise<string | null> | null = null

/**
 * Logo FaîtiereHub en data URL, pour les exports raster du navigateur (un SVG
 * rasterisé via <img> ne charge pas d'URL). Chargé une fois par page ; absent
 * ou illisible : `null`, et la carte dessine l'emblème vectoriel. Côté
 * serveur, voir `loadCardLogoDataUrl` (fonts.ts).
 */
export function loadPlatformLogo(): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (!platformLogo) {
    platformLogo = inlineImage(PLATFORM_LOGO_PATH, { maxBytes: 256_000 }).then((img) => {
      // Échec (réseau) : on réessaiera au prochain export.
      if (!img) platformLogo = null
      return img?.dataUrl ?? null
    })
  }
  return platformLogo
}

let fontCss: Promise<string | null> | null = null

/**
 * Règles @font-face de Poppins en data URL, pour les exports raster du
 * navigateur : un SVG rasterisé via <img> ne charge aucune police externe.
 * Les quatre graisses (~630 Ko) sont lues une fois par page, depuis la copie
 * publique (public/fonts/card). Échec : `null`, et l'export retombe sur les
 * polices du système (la mise en page reste mesurée pour Poppins).
 */
export function loadCardFontCss(): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (!fontCss) {
    fontCss = Promise.all(
      CARD_FONT_FACES.map(async (f) => {
        const response = await fetch(`${CARD_FONT_PUBLIC_PATH}${f.file}`)
        if (!response.ok) throw new Error(`Police ${f.file} : HTTP ${response.status}`)
        return [f.file, toBase64(new Uint8Array(await response.arrayBuffer()))] as const
      }),
    )
      .then((files) => {
        const byFile = new Map<string, string>(files)
        return cardFontFaceCss((file) => `data:font/ttf;base64,${byFile.get(file) ?? ''}`)
      })
      .catch(() => {
        // Échec (réseau) : on réessaiera au prochain export.
        fontCss = null
        return null
      })
  }
  return fontCss
}
