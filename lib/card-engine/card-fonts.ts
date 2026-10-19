/**
 * Polices de la carte de membre : manifeste partagé par le rendu serveur
 * (resvg, voir fonts.ts) et le navigateur (aperçu inséré dans la page, export
 * canvas).
 *
 * Poppins (SIL OFL 1.1, voir fonts/POPPINS-OFL.txt) porte tout le texte, en
 * quatre graisses. Liberation Sans (SIL OFL 1.1, fonts/LICENSE.txt) ne sert
 * qu'aux grappes que Poppins ne dessine pas — lettres éwé et kabiyè, tons
 * combinants — et y est désignée explicitement (text-metrics.ts, `fontRuns`).
 *
 * Les fichiers vivent dans lib/card-engine/fonts (lus par le serveur) ; une
 * copie identique de Poppins est servie au navigateur depuis public/fonts/card.
 */

/** Famille de la carte de membre (resvg : `defaultFontFamily`). */
export const MEMBER_CARD_FONT_FAMILY = 'Poppins'

/** Pile du texte de la carte. */
export const CARD_FONT_STACK = 'Poppins, Liberation Sans, Arial, Helvetica, sans-serif'

/** Pile des grappes que Poppins ne dessine pas (métriques d'Arial). */
export const CARD_FALLBACK_STACK = 'Liberation Sans, Arial, Helvetica, sans-serif'

export const CARD_FONT_FACES = [
  { file: 'Poppins-Regular.ttf', weight: 400 },
  { file: 'Poppins-Medium.ttf', weight: 500 },
  { file: 'Poppins-SemiBold.ttf', weight: 600 },
  { file: 'Poppins-Bold.ttf', weight: 700 },
] as const

export const CARD_FALLBACK_FILES = [
  'LiberationSans-Regular.ttf',
  'LiberationSans-Bold.ttf',
] as const

/** Chemin public des polices pour le navigateur (copie de lib/card-engine/fonts). */
export const CARD_FONT_PUBLIC_PATH = '/fonts/card/'

/**
 * Règles @font-face de Poppins. `src(file)` donne l'URL de chaque fichier :
 * chemin public pour un SVG inséré dans la page, data URL pour un SVG
 * rasterisé via <img> (qui ne charge aucune ressource externe).
 */
export function cardFontFaceCss(src: (file: string) => string): string {
  return CARD_FONT_FACES.map(
    (f) =>
      `@font-face{font-family:${MEMBER_CARD_FONT_FAMILY};font-style:normal;font-weight:${f.weight};font-display:block;src:url("${src(f.file)}") format("truetype")}`,
  ).join('')
}
