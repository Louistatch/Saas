import type { CardTemplate, MemberCard } from '@/types/domain'
import { toMatrix } from '@/lib/utils/qr'

interface RenderOptions {
  card: MemberCard
  template: CardTemplate
  cooperativeName?: string
  qrPayload: string
}

/**
 * Render a member card to a canvas at print quality (1012x638 ≈ ID-1 @ 300 DPI).
 * Returns a Blob (PNG) ready for download.
 */
export async function renderCardImage({
  card,
  template,
  cooperativeName,
  qrPayload,
}: RenderOptions): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1012
  canvas.height = 638
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported in this browser')

  // Background
  ctx.fillStyle = template.bgColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Decorative circles
  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)'
  ctx.beginPath()
  ctx.arc(900, -50, 200, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(-100, 550, 250, 0, Math.PI * 2)
  ctx.fill()

  // Title
  ctx.fillStyle = template.textColor
  ctx.font = '600 48px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.fillText(template.title, 50, 100)

  // Subtitle
  ctx.font = '400 24px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.globalAlpha = 0.9
  ctx.fillText(template.subtitle, 50, 140)
  ctx.globalAlpha = 1

  // Cooperative name (top-right)
  if (cooperativeName) {
    ctx.font = '500 18px system-ui, -apple-system, "Segoe UI", sans-serif'
    ctx.globalAlpha = 0.8
    const w = ctx.measureText(cooperativeName).width
    ctx.fillText(cooperativeName, canvas.width - 50 - w, 60)
    ctx.globalAlpha = 1
  }

  // Member name
  const memberName = card.member
    ? `${card.member.first_name} ${card.member.last_name}`
    : 'Member'
  ctx.font = '600 36px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.fillText(memberName, 50, 430)

  // Card number label + value
  ctx.font = '500 14px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.globalAlpha = 0.75
  ctx.fillText('MEMBER ID', 50, 480)
  ctx.globalAlpha = 1
  ctx.font = '600 30px ui-monospace, "SFMono-Regular", "Menlo", monospace'
  ctx.fillText(card.card_number, 50, 520)

  // Expiry
  if (card.expiry_date) {
    ctx.font = '500 14px system-ui, -apple-system, "Segoe UI", sans-serif'
    ctx.globalAlpha = 0.75
    ctx.fillText(`EXPIRES  ${card.expiry_date}`, 50, 560)
    ctx.globalAlpha = 1
  }

  // QR code (real)
  const matrix = toMatrix(qrPayload, 'M')
  const qrSize = 220
  const qrX = canvas.width - qrSize - 50
  const qrY = 380
  // White background panel
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20)
  // Draw modules
  const cellSize = qrSize / matrix.length
  ctx.fillStyle = '#000000'
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix.length; x++) {
      if (matrix[y][x]) {
        ctx.fillRect(
          qrX + x * cellSize,
          qrY + y * cellSize,
          cellSize + 0.5, // anti-gap padding
          cellSize + 0.5,
        )
      }
    }
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to create card image'))
    }, 'image/png')
  })
}

/**
 * Downloads a card to the user's machine as PNG.
 */
export async function downloadCardImage(opts: RenderOptions, filename?: string) {
  const blob = await renderCardImage(opts)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `member-card-${opts.card.card_number}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
