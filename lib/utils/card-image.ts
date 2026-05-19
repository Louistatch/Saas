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
 * Load an image from URL. Returns null on failure.
 */
async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
    setTimeout(() => resolve(null), 5000)
  })
}

// Premium color palette
const COLORS = {
  primary: '#0B6B3A',
  accent: '#1ED760',
  secondary: '#D9F4E6',
  premium: '#0A1F14',
  white: '#FFFFFF',
  whiteAlpha: 'rgba(255,255,255,0.08)',
  whiteAlpha15: 'rgba(255,255,255,0.15)',
  whiteAlpha30: 'rgba(255,255,255,0.30)',
  whiteAlpha60: 'rgba(255,255,255,0.60)',
  whiteAlpha90: 'rgba(255,255,255,0.90)',
  glassBg: 'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(255,255,255,0.12)',
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawGlassPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, radius = 20,
) {
  roundRect(ctx, x, y, w, h, radius)
  ctx.fillStyle = COLORS.glassBg
  ctx.fill()
  ctx.strokeStyle = COLORS.glassBorder
  ctx.lineWidth = 1
  ctx.stroke()
}

/**
 * Draw organic agricultural micro-pattern (subtle leaf shapes)
 */
function drawMicroPattern(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.save()
  ctx.globalAlpha = 0.03
  ctx.strokeStyle = COLORS.white
  ctx.lineWidth = 1.5
  for (let i = 0; i < 12; i++) {
    const x = (W * 0.1) + (i % 4) * (W * 0.25)
    const y = (H * 0.15) + Math.floor(i / 4) * (H * 0.3)
    ctx.beginPath()
    ctx.ellipse(x, y, 30, 15, (i * 0.5), 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Render a premium "WAOO" member card.
 * Canvas: 1600x1000 (16:10 ratio, print-quality)
 */
export async function renderCardImage({
  card,
  template,
  cooperativeName,
  faitiereName,
  qrPayload,
}: RenderOptions): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = 1000
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  const W = canvas.width
  const H = canvas.height

  // === BACKGROUND: Premium gradient ===
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, '#0B6B3A')
  grad.addColorStop(0.5, '#0E8C49')
  grad.addColorStop(1, '#163D2B')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // === ORGANIC SHAPES (depth) ===
  ctx.save()
  ctx.globalAlpha = 0.06
  ctx.fillStyle = COLORS.white
  ctx.beginPath()
  ctx.ellipse(W * 0.85, H * 0.15, 250, 250, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(W * 0.1, H * 0.85, 200, 200, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(W * 0.5, H * 1.1, 400, 200, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // === MICRO PATTERN ===
  drawMicroPattern(ctx, W, H)

  // === HEADER BAR ===
  drawGlassPanel(ctx, 40, 30, W - 80, 70, 16)

  // Logo text (embossed style)
  ctx.font = '600 18px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = COLORS.whiteAlpha60
  ctx.fillText('FaîtiereHub', 70, 72)

  // Title
  ctx.font = '300 16px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = COLORS.whiteAlpha90
  ctx.textAlign = 'center'
  ctx.fillText('MEMBER IDENTITY PASS', W / 2, 72)
  ctx.textAlign = 'left'

  // Verified badge
  ctx.font = '500 13px system-ui'
  ctx.fillStyle = COLORS.accent
  const badgeText = '✓ VERIFIED MEMBER'
  const badgeW = ctx.measureText(badgeText).width
  roundRect(ctx, W - 70 - badgeW - 20, 48, badgeW + 30, 30, 15)
  ctx.fillStyle = 'rgba(30, 215, 96, 0.15)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(30, 215, 96, 0.4)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = COLORS.accent
  ctx.font = '600 12px system-ui'
  ctx.fillText(badgeText, W - 70 - badgeW - 5, 68)

  // === HERO SECTION: Photo + Name ===
  const photoX = 80
  const photoY = 140
  const photoSize = 160

  // Photo circle with glassmorphism border
  ctx.save()
  ctx.beginPath()
  ctx.arc(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2 + 6, 0, Math.PI * 2)
  ctx.strokeStyle = COLORS.whiteAlpha30
  ctx.lineWidth = 3
  ctx.stroke()

  // Outer glow
  ctx.shadowColor = 'rgba(30, 215, 96, 0.3)'
  ctx.shadowBlur = 20
  ctx.beginPath()
  ctx.arc(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2 + 2, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(30, 215, 96, 0.2)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.restore()

  // Clip and draw photo
  ctx.save()
  ctx.beginPath()
  ctx.arc(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2, 0, Math.PI * 2)
  ctx.clip()

  let photoLoaded = false
  if (card.member?.photo_url) {
    const img = await loadImage(card.member.photo_url)
    if (img) {
      ctx.drawImage(img, photoX, photoY, photoSize, photoSize)
      photoLoaded = true
    }
  }
  if (!photoLoaded) {
    ctx.fillStyle = '#1a3d2b'
    ctx.fillRect(photoX, photoY, photoSize, photoSize)
    // Silhouette
    ctx.fillStyle = COLORS.whiteAlpha30
    ctx.beginPath()
    ctx.arc(photoX + photoSize / 2, photoY + 55, 28, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(photoX + photoSize / 2, photoY + 130, 40, 30, 0, Math.PI, 0, true)
    ctx.fill()
  }
  ctx.restore()

  // Member name (large, elegant)
  const nameX = photoX + photoSize + 40
  const nameY = photoY + 40
  const memberName = card.member
    ? `${card.member.first_name} ${card.member.last_name}`
    : 'Membre'
  ctx.font = '700 42px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = COLORS.white
  ctx.fillText(memberName, nameX, nameY)

  // Role / Cooperative
  ctx.font = '400 18px system-ui'
  ctx.fillStyle = COLORS.whiteAlpha60
  ctx.fillText(cooperativeName ?? 'Coopérative', nameX, nameY + 35)

  // Card number (embossed style)
  ctx.font = '300 15px ui-monospace, monospace'
  ctx.fillStyle = COLORS.accent
  ctx.fillText(card.card_number, nameX, nameY + 70)

  // === INFORMATION BLOCKS (glass panels) ===
  const blockY = 360
  const blockH = 90
  const blockW = 340
  const gap = 24
  const col1X = 60
  const col2X = col1X + blockW + gap

  const infoBlocks = [
    {
      icon: '📍',
      label: 'LOCALITÉ',
      value: [card.member?.village, card.member?.canton, card.member?.prefecture, card.member?.region]
        .filter(Boolean)
        .join(', ') || '—',
    },
    {
      icon: '📞',
      label: 'TÉLÉPHONE',
      value: card.member?.phone ?? '—',
    },
    {
      icon: '🏢',
      label: 'COOPÉRATIVE',
      value: cooperativeName ?? '—',
    },
    {
      icon: '🌿',
      label: 'FAÎTIÈRE',
      value: faitiereName ?? '—',
    },
  ]

  infoBlocks.forEach((block, i) => {
    const x = i % 2 === 0 ? col1X : col2X
    const y = blockY + Math.floor(i / 2) * (blockH + gap)

    drawGlassPanel(ctx, x, y, blockW, blockH, 18)

    // Icon
    ctx.font = '24px system-ui'
    ctx.fillText(block.icon, x + 18, y + 42)

    // Label
    ctx.font = '500 11px system-ui'
    ctx.fillStyle = COLORS.whiteAlpha60
    ctx.fillText(block.label, x + 55, y + 32)

    // Value
    ctx.font = '500 16px system-ui'
    ctx.fillStyle = COLORS.white
    const displayValue = block.value.length > 35 ? block.value.slice(0, 35) + '…' : block.value
    ctx.fillText(displayValue, x + 55, y + 58)
  })

  // === QR CODE SECTION (right side) ===
  const qrBlockX = W - 280
  const qrBlockY = 360
  const qrBlockW = 230
  const qrBlockH = 230

  drawGlassPanel(ctx, qrBlockX, qrBlockY, qrBlockW, qrBlockH, 20)

  // "Scan to Verify" label
  ctx.font = '500 11px system-ui'
  ctx.fillStyle = COLORS.whiteAlpha60
  ctx.textAlign = 'center'
  ctx.fillText('SCAN TO VERIFY', qrBlockX + qrBlockW / 2, qrBlockY + 25)
  ctx.textAlign = 'left'

  // QR code
  const matrix = toMatrix(qrPayload, 'M')
  const qrSize = 150
  const qrX = qrBlockX + (qrBlockW - qrSize) / 2
  const qrY = qrBlockY + 40

  // White background with rounded corners
  roundRect(ctx, qrX - 10, qrY - 5, qrSize + 20, qrSize + 20, 12)
  ctx.fillStyle = COLORS.white
  ctx.fill()

  // QR halo glow
  ctx.save()
  ctx.shadowColor = 'rgba(30, 215, 96, 0.25)'
  ctx.shadowBlur = 15
  roundRect(ctx, qrX - 10, qrY - 5, qrSize + 20, qrSize + 20, 12)
  ctx.strokeStyle = 'rgba(30, 215, 96, 0.3)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()

  // Draw QR modules
  const cellSize = qrSize / matrix.length
  ctx.fillStyle = COLORS.premium
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix.length; col++) {
      if (matrix[row][col]) {
        ctx.fillRect(
          qrX + col * cellSize,
          qrY + row * cellSize,
          cellSize + 0.3,
          cellSize + 0.3,
        )
      }
    }
  }

  // === FOOTER ===
  const footerY = H - 100

  // Glass panel footer
  drawGlassPanel(ctx, 40, footerY, W - 80, 70, 16)

  // Valid until
  ctx.font = '400 12px system-ui'
  ctx.fillStyle = COLORS.whiteAlpha60
  ctx.fillText('VALID UNTIL', 70, footerY + 30)

  const expiryText = card.expiry_date
    ? new Date(card.expiry_date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).toUpperCase()
    : '—'
  ctx.font = '600 18px system-ui'
  ctx.fillStyle = COLORS.white
  ctx.fillText(expiryText, 70, footerY + 55)

  // Progress bar (validity indicator)
  const barX = 300
  const barY = footerY + 38
  const barW = 200
  const barH = 6
  // Background
  roundRect(ctx, barX, barY, barW, barH, 3)
  ctx.fillStyle = COLORS.whiteAlpha15
  ctx.fill()
  // Fill (calculate progress based on expiry)
  let progress = 1
  if (card.expiry_date) {
    const now = Date.now()
    const created = new Date(card.created_at).getTime()
    const expiry = new Date(card.expiry_date).getTime()
    const total = expiry - created
    const elapsed = now - created
    progress = Math.max(0, Math.min(1, 1 - elapsed / total))
  }
  roundRect(ctx, barX, barY, barW * progress, barH, 3)
  ctx.fillStyle = COLORS.accent
  ctx.fill()

  // Status indicator
  ctx.font = '500 12px system-ui'
  ctx.fillStyle = COLORS.accent
  ctx.fillText(`${Math.round(progress * 100)}% remaining`, barX + barW + 15, barY + 5)

  // Subtitle / branding
  ctx.font = '300 12px system-ui'
  ctx.fillStyle = COLORS.whiteAlpha60
  ctx.textAlign = 'right'
  ctx.fillText(template.subtitle || 'Digital Access Pass', W - 70, footerY + 30)
  ctx.font = '500 11px system-ui'
  ctx.fillStyle = COLORS.whiteAlpha30
  ctx.fillText('Powered by FaîtiereHub', W - 70, footerY + 52)
  ctx.textAlign = 'left'

  // === CARD NUMBER (embossed, bottom-left of main area) ===
  ctx.font = '300 13px ui-monospace, monospace'
  ctx.fillStyle = COLORS.whiteAlpha30
  ctx.fillText(`ID: ${card.card_number}`, 70, footerY - 20)

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
