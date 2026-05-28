/**
 * Card Image Utilities — Bridge to Card Engine
 * 
 * This file maintains backward compatibility with existing code
 * that imports from '@/lib/utils/card-image'.
 * 
 * Internally delegates to the new Card Engine (lib/card-engine/).
 */

import type { CardTemplate, MemberCard } from '@/types/domain'
import { buildCardSchema, renderToPng, downloadCard as engineDownload } from '@/lib/card-engine'

export interface RenderOptions {
  card: MemberCard
  template: CardTemplate
  cooperativeName?: string
  faitiereName?: string
  qrPayload: string
  level?: 'or' | 'argent' | 'bronze'
}

/**
 * Render a card to PNG Blob.
 * Bridge: converts old RenderOptions to new CardSchema.
 */
export async function renderCardImage(opts: RenderOptions): Promise<Blob> {
  const schema = buildCardSchema({
    member: {
      first_name: opts.card.member?.first_name ?? '',
      last_name: opts.card.member?.last_name ?? '',
      phone: opts.card.member?.phone,
      photo_url: opts.card.member?.photo_url,
      village: opts.card.member?.village,
      canton: opts.card.member?.canton,
      prefecture: opts.card.member?.prefecture,
      region: opts.card.member?.region,
    },
    cardNumber: opts.card.card_number,
    expiryDate: opts.card.expiry_date,
    createdAt: opts.card.created_at,
    cooperativeName: opts.cooperativeName ?? '',
    faitiereName: opts.faitiereName ?? 'FENOMAT',
    accentColor: opts.template.bgColor === '#16a34a' ? '#1ed760' : opts.template.bgColor,
    textColor: opts.template.textColor,
    level: opts.level,
  })
  return renderToPng(schema)
}

/**
 * Render and download a card as PNG.
 */
export async function downloadCardImage(opts: RenderOptions, filename?: string): Promise<void> {
  const schema = buildCardSchema({
    member: {
      first_name: opts.card.member?.first_name ?? '',
      last_name: opts.card.member?.last_name ?? '',
      phone: opts.card.member?.phone,
      photo_url: opts.card.member?.photo_url,
      village: opts.card.member?.village,
      canton: opts.card.member?.canton,
      prefecture: opts.card.member?.prefecture,
      region: opts.card.member?.region,
    },
    cardNumber: opts.card.card_number,
    expiryDate: opts.card.expiry_date,
    createdAt: opts.card.created_at,
    cooperativeName: opts.cooperativeName ?? '',
    faitiereName: opts.faitiereName ?? 'FENOMAT',
    accentColor: opts.template.bgColor === '#16a34a' ? '#1ed760' : opts.template.bgColor,
    textColor: opts.template.textColor,
    level: opts.level,
  })
  await engineDownload(schema, filename ?? `carte-membre-${opts.card.card_number}.png`)
}
