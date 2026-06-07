/**
 * Card Engine — FaîtiereHub
 * 
 * Architecture:
 *   CardSchema (JSON) → Renderer (Canvas 2D) → PNG/PDF
 * 
 * Single Source of Truth: The CardSchema JSON defines everything.
 * The renderer is deterministic: same schema → same output.
 * Preview === Export === Print.
 */

export { buildCardSchema, PREVIEW_SCHEMA } from './schema'
export type { CardSchema } from './schema'
export { renderToCanvas, renderToPng, downloadCard, renderToDataUrl, renderToSvgString } from './renderer'
