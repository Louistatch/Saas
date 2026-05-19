import type { CardTemplate, MemberCard } from '@/types/domain'
import { toMatrix } from '@/lib/utils/qr'

interface RenderOptions {
  card: MemberCard
  template: CardTemplate
  cooperativeName?: string
  faitiereName?: string
  qrPayload: string
}

/**
 * Load an image from URL and return it as an HTMLImageElement.
 * Returns null if loading fails (CORS, 404, etc.)
 */
async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
    // Timeout after 5s
    setTimeout(() => resolve(null), 5000)
  })
}

/**
 * Render a member card to a canvas at print quality.
 * Format: ID card style (1012x638 ≈ ID-1 @ 300 DPI).
 * Includes: photo, name, phone, cooperative, faîtière, localité, QR code.
 */
export async function renderCardImage({
  card,
  template,
  cooperativeName,
  faitiereName,
  qrPayload,
}: RenderOptions): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1012
  canvas.height = 638
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported in this browser')

  const W = canvas.width
  const H = canvas.height

  // Background
  ctx.fillStyle = template.bgColor
  ctx.fillRect(0, 0, W, H)

  // Decorative elements
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.beginPath()
  ctx.arc(W - 80, -40, 180, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(-60, H + 20, 200, 0, Math.PI * 2)
  ctx.fill()

  // Top band (slightly darker)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'
  ctx.fillRect(0, 0, W, 80)

  // Title bar
  ctx.fillStyle = template.textColor
  ctx.font = '600 28px system-ui, -apple-system, sans-serif'
  ctx.fillText(template.title, 30, 52)

  // Faîtière name (top right)
  if (faitiereName) {
    ctx.font = '400 14px system-ui, -apple-system, sans-serif'
    ctx.globalAlpha = 0.85
    const fw = ctx.measureText(faitiereName).width
    ctx.fillText(faitiereName, W - fw - 30, 52)
    ctx.globalAlpha = 1
  }

  // --- LEFT SIDE: Photo ---
  const photoX = 30
  const photoY = 100
  const photoW = 180
  const photoH = 220

  // Photo frame
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(photoX - 4, photoY - 4, photoW + 8, photoH + 8)

  // Try to load member photo
  let photoLoaded = false
  if (card.member?.photo_url) {
    const img = await loadImage(card.member.photo_url)
    if (img) {
      ctx.drawImage(img, photoX, photoY, photoW, photoH)
      photoLoaded = true
    }
  }

  if (!photoLoaded) {
    // Placeholder silhouette
    ctx.fillStyle = '#e5e7eb'
    ctx.fillRect(photoX, photoY, photoW, photoH)
    ctx.fillStyle = '#9ca3af'
    ctx.font = '400 12px system-ui'
    ctx.fillText('PHOTO', photoX + 65, photoY + 115)
    // Simple person icon
    ctx.beginPath()
    ctx.arc(photoX + photoW / 2, photoY + 70, 30, 0, Math.PI * 2)
    ctx.fillStyle = '#d1d5db'
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(photoX + photoW / 2, photoY + 160, 50, 35, 0, Math.PI, 0, true)
    ctx.fill()
  }

  // --- RIGHT SIDE: Member info ---
  const infoX = 240
  const infoY = 110
  const lineH = 32

  ctx.fillStyle = template.textColor
  let y = infoY

  // Member name
  const memberName = card.member
    ? `${card.member.first_name} ${card.member.last_name}`
    : 'Membre'
  ctx.font = '700 26px system-ui, -apple-system, sans-serif'
  ctx.fillText(memberName, infoX, y)
  y += lineH + 8

  // Card number
  ctx.font = '500 13px system-ui'
  ctx.globalAlpha = 0.7
  ctx.fillText('N° CARTE', infoX, y)
  ctx.globalAlpha = 1
  ctx.font = '600 18px ui-monospace, monospace'
  ctx.fillText(card.card_number, infoX + 90, y)
  y += lineH

  // Phone
  if (card.member?.phone) {
    ctx.font = '500 13px system-ui'
    ctx.globalAlpha = 0.7
    ctx.fillText('TÉLÉPHONE', infoX, y)
    ctx.globalAlpha = 1
    ctx.font = '500 16px system-ui'
    ctx.fillText(card.member.phone, infoX + 90, y)
    y += lineH
  }

  // Cooperative
  if (cooperativeName) {
    ctx.font = '500 13px system-ui'
    ctx.globalAlpha = 0.7
    ctx.fillText('COOPÉRATIVE', infoX, y)
    ctx.globalAlpha = 1
    ctx.font = '500 16px system-ui'
    ctx.fillText(cooperativeName, infoX + 110, y)
    y += lineH
  }

  // Faîtière
  if (faitiereName) {
    ctx.font = '500 13px system-ui'
    ctx.globalAlpha = 0.7
    ctx.fillText('FAÎTIÈRE', infoX, y)
    ctx.globalAlpha = 1
    ctx.font = '500 15px system-ui'
    const displayFaitiere = faitiereName.length > 35 ? faitiereName.slice(0, 35) + '…' : faitiereName
    ctx.fillText(displayFaitiere, infoX + 90, y)
    y += lineH
  }

  // Localité
  const locality: string[] = []
  if (card.member?.village) locality.push(card.member.village)
  if (card.member?.canton) locality.push(card.member.canton)
  if (card.member?.prefecture) locality.push(card.member.prefecture)
  if (card.member?.region) locality.push(card.member.region)

  if (locality.length > 0) {
    ctx.font = '500 13px system-ui'
    ctx.globalAlpha = 0.7
    ctx.fillText('LOCALITÉ', infoX, y)
    ctx.globalAlpha = 1
    ctx.font = '500 14px system-ui'
    // Split into 2 lines if too long
    const locStr = locality.join(', ')
    if (locStr.length > 45) {
      ctx.fillText(locality.slice(0, 2).join(', '), infoX + 90, y)
      y += 20
      ctx.fillText(locality.slice(2).join(', '), infoX + 90, y)
    } else {
      ctx.fillText(locStr, infoX + 90, y)
    }
    y += lineH
  }

  // --- BOTTOM: Expiry + QR ---
  // Expiry date
  if (card.expiry_date) {
    ctx.font = '500 13px system-ui'
    ctx.globalAlpha = 0.7
    ctx.fillText('VALIDE JUSQU\'AU', 30, H - 50)
    ctx.globalAlpha = 1
    ctx.font = '600 18px system-ui'
    ctx.fillText(card.expiry_date, 30, H - 25)
  }

  // Subtitle
  ctx.font = '400 13px system-ui'
  ctx.globalAlpha = 0.6
  ctx.fillText(template.subtitle, 30, H - 80)
  ctx.globalAlpha = 1

  // QR code (bottom right)
  const matrix = toMatrix(qrPayload, 'M')
  const qrSize = 140
  const qrX = W - qrSize - 30
  const qrY = H - qrSize - 30
  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16)
  // Draw modules
  const cellSize = qrSize / matrix.length
  ctx.fillStyle = '#000000'
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix.length; col++) {
      if (matrix[row][col]) {
        ctx.fillRect(
          qrX + col * cellSize,
          qrY + row * cellSize,
          cellSize + 0.5,
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
  a.download = filename ?? `carte-membre-${opts.card.card_number}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
