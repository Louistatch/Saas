import 'server-only'

/**
 * Polices embarquées pour la rasterisation des cartes.
 *
 * `@resvg/resvg-wasm` tourne dans un bac à sable WebAssembly : il n'a accès à
 * aucune police du système. Sans buffer fourni explicitement, tout `<text>`
 * du SVG est rendu… vide. Les cartes sortaient donc en PNG avec le décor, les
 * QR codes et les médaillons, mais sans un seul caractère — nom, numéro de
 * carte et mentions compris.
 *
 * Liberation Sans est embarquée pour deux raisons : elle est métriquement
 * compatible avec Arial (la famille demandée par les SVG de cartes), et sa
 * licence SIL OFL 1.1 autorise la redistribution — voir `fonts/LICENSE.txt`.
 */

const FONT_FILES = ['LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf']

/** Famille de repli : resvg l'utilise quand `font-family` est introuvable. */
export const CARD_FONT_FAMILY = 'Liberation Sans'

let cached: Uint8Array[] | null = null

/** Lit les polices une fois par instance ; ~800 Ko gardés en mémoire. */
export async function loadCardFonts(): Promise<Uint8Array[]> {
  if (cached) return cached
  const { readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const dir = join(process.cwd(), 'lib', 'card-engine', 'fonts')
  cached = await Promise.all(
    FONT_FILES.map(async (file) => new Uint8Array(await readFile(join(dir, file)))),
  )
  return cached
}
