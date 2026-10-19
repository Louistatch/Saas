/**
 * Moteur de cartes — FaîtiereHub.
 *
 *   CardSchema (JSON) → SVG (face unique) → PNG, PDF, feuille imprimée
 *
 * Source unique : le schéma. Le rendu est déterministe, et l'aperçu, le PNG,
 * le PDF et la feuille A4 sont le même dessin.
 *
 * Ce point d'entrée est sûr pour le navigateur. Les polices embarquées
 * (`./fonts`, `server-only`) et l'assemblage PDF (`./pdf`) s'importent
 * directement depuis leur module.
 */

export { buildCardSchema, DEFAULT_CARD_SUBTITLE, DEFAULT_CARD_TITLE } from './schema'
export type { BuildCardSchemaOptions, CardLevel, CardSchema, OrgLevel } from './schema'
export {
  cardRasterSize,
  downloadCard,
  renderCardCanvas,
  renderCardSvg,
  renderToDataUrl,
  renderToPng,
  renderToSvgString,
  triggerDownload,
} from './renderer'
export type { CardRenderOptions, RasterOptions } from './renderer'
export { resolveCardBranding } from './branding'
export type { BrandingOrg, BrandingTemplate, ResolvedCardBranding } from './branding'
export { cardVerifyUrl, CARD_VERIFY_ORIGIN } from './verify-url'
export {
  inlineCardImages,
  inlineImage,
  loadCardFontCss,
  loadPlatformLogo,
  PLATFORM_LOGO_PATH,
} from './assets'
export { CARD_FONT_PUBLIC_PATH, CARD_FONT_STACK } from './card-fonts'
