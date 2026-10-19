import 'server-only'
import { CARD_FALLBACK_FILES, CARD_FONT_FACES } from './card-fonts'

/**
 * Polices embarquées pour la rasterisation des cartes.
 *
 * `@resvg/resvg-wasm` tourne dans un bac à sable WebAssembly : il n'a accès à
 * aucune police du système. Sans buffer fourni explicitement, tout `<text>`
 * du SVG est rendu… vide. Les cartes sortaient donc en PNG avec le décor, les
 * QR codes et les médaillons, mais sans un seul caractère — nom, numéro de
 * carte et mentions compris.
 *
 * La carte de membre est composée en Poppins (SIL OFL 1.1, voir
 * `fonts/POPPINS-OFL.txt`), avec Liberation Sans pour les lettres que Poppins
 * n'a pas. La carte Haroo n'utilise que Liberation Sans, métriquement
 * compatible avec Arial (SIL OFL 1.1, `fonts/LICENSE.txt`).
 */

const FONT_FILES = ['LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf']

/** Famille de repli : resvg l'utilise quand `font-family` est introuvable. */
export const CARD_FONT_FAMILY = 'Liberation Sans'

export { MEMBER_CARD_FONT_FAMILY } from './card-fonts'

async function readFonts(files: readonly string[]): Promise<Uint8Array[]> {
  const { readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const dir = join(process.cwd(), 'lib', 'card-engine', 'fonts')
  return Promise.all(files.map(async (file) => new Uint8Array(await readFile(join(dir, file)))))
}

let cached: Uint8Array[] | null = null

/** Polices de la carte Haroo (Liberation Sans) ; lues une fois par instance. */
export async function loadCardFonts(): Promise<Uint8Array[]> {
  cached ??= await readFonts(FONT_FILES)
  return cached
}

let memberCached: Uint8Array[] | null = null

/**
 * Polices de la carte de membre : Poppins en quatre graisses, puis Liberation
 * Sans pour les grappes que Poppins ne dessine pas (lettres éwé et kabiyè,
 * tons combinants ; voir text-metrics.ts). ~1,4 Mo gardés en mémoire.
 */
export async function loadMemberCardFonts(): Promise<Uint8Array[]> {
  memberCached ??= await readFonts([...CARD_FONT_FACES.map((f) => f.file), ...CARD_FALLBACK_FILES])
  return memberCached
}

let logoCached: string | null | undefined

/**
 * Logo officiel (public/logo.png) en data URL pour les cartes rasterisées :
 * resvg ne charge pas d'URL distante, une data URL si. `null` si le fichier
 * est absent (la carte retombe alors sur l'emblème vectoriel).
 */
export async function loadCardLogoDataUrl(): Promise<string | null> {
  if (logoCached !== undefined) return logoCached
  try {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const buf = await readFile(join(process.cwd(), 'public', 'logo.png'))
    logoCached = `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    logoCached = null
  }
  return logoCached
}
