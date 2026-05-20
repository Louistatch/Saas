import type { CardTemplate, MemberCard } from '@/types/domain'
import { toMatrix } from '@/lib/utils/qr'

interface RenderOptions {
  card: MemberCard
  template: CardTemplate
  cooperativeName?: string
  faitiereName?: string
  qrPayload: string
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
    setTimeout(() => resolve(null), 8000)
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

/**
 * Render the FaîtiereHub Member Identity Pass
 * Based on the premium design: dark green gradient, circular photo,
 * info blocks, QR code, verified badge, digital signature, status bar.
 * 
 * Canvas: 1600x1000 (16:10)
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
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height

  // === BACKGROUND: Dark green gradient ===
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0a2e1a')
  bg.addColorStop(0.4, '#0d3d22')
  bg.addColorStop(1, '#061a0f')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Organic leaf shapes (subtle)
  ctx.save()
  ctx.globalAlpha = 0.04
  ctx.fillStyle = '#1ed760'
  ctx.beginPath(); ctx.ellipse(W * 0.9, 80, 200, 100, -0.3, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(50, H * 0.7, 150, 80, 0.5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(W * 0.5, H - 50, 300, 60, 0, 0, Math.PI * 2); ctx.fill()
  // Top-right decorative curve
  ctx.strokeStyle = '#1ed760'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(W - 100, -200, 400, 0.3, 1.2); ctx.stroke()
  ctx.beginPath(); ctx.arc(W - 50, -250, 450, 0.3, 1.1); ctx.stroke()
  ctx.restore()

  // === HEADER BAR ===
  roundRect(ctx, 30, 20, W - 60, 60, 12)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Logo text
  ctx.font = '700 20px system-ui'
  ctx.fillStyle = '#1ed760'
  ctx.fillText('🌿 FaîtiereHub', 55, 57)

  // Header title
  ctx.font = '400 14px system-ui'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillText('MEMBER IDENTITY PASS', 260, 50)
  ctx.font = '300 12px system-ui'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText(faitiereName ?? 'Faîtière Agricole', 260, 68)

  // Verified badge (top right)
  roundRect(ctx, W - 250, 30, 200, 40, 20)
  ctx.fillStyle = 'rgba(30, 215, 96, 0.15)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(30, 215, 96, 0.4)'
  ctx.stroke()
  ctx.font = '600 14px system-ui'
  ctx.fillStyle = '#1ed760'
  ctx.fillText('✓  VERIFIED MEMBER', W - 230, 56)

  // === PHOTO (circular, left side) ===
  const photoX = 100, photoY = 160, photoR = 110

  // Outer ring
  ctx.beginPath()
  ctx.arc(photoX + photoR, photoY + photoR, photoR + 8, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(30, 215, 96, 0.3)'
  ctx.lineWidth = 3
  ctx.stroke()

  // Green glow
  ctx.save()
  ctx.shadowColor = 'rgba(30, 215, 96, 0.4)'
  ctx.shadowBlur = 25
  ctx.beginPath()
  ctx.arc(photoX + photoR, photoY + photoR, photoR + 4, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(30, 215, 96, 0.2)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()

  // Photo clip
  ctx.save()
  ctx.beginPath()
  ctx.arc(photoX + photoR, photoY + photoR, photoR, 0, Math.PI * 2)
  ctx.clip()

  let photoLoaded = false
  if (card.member?.photo_url) {
    const img = await loadImage(card.member.photo_url)
    if (img) {
      const size = photoR * 2
      ctx.drawImage(img, photoX, photoY, size, size)
      photoLoaded = true
    }
  }
  if (!photoLoaded) {
    ctx.fillStyle = '#1a3d2b'
    ctx.fillRect(photoX, photoY, photoR * 2, photoR * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.beginPath(); ctx.arc(photoX + photoR, photoY + 70, 30, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(photoX + photoR, photoY + 150, 45, 30, 0, Math.PI, 0, true); ctx.fill()
  }
  ctx.restore()

  // Verified checkmark on photo
  ctx.beginPath()
  ctx.arc(photoX + photoR * 1.6, photoY + photoR * 1.7, 18, 0, Math.PI * 2)
  ctx.fillStyle = '#1ed760'
  ctx.fill()
  ctx.font = '700 16px system-ui'
  ctx.fillStyle = '#fff'
  ctx.fillText('✓', photoX + photoR * 1.6 - 6, photoY + photoR * 1.7 + 6)

  // === MEMBER NAME (large, right of photo) ===
  const nameX = 360, nameY = 180
  const memberName = card.member ? `${card.member.first_name} ${card.member.last_name}`.toUpperCase() : 'MEMBRE'
  const firstName = card.member?.first_name?.toLowerCase() ?? ''
  const lastName = card.member?.last_name?.toUpperCase() ?? ''

  ctx.font = '300 38px system-ui'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(firstName, nameX, nameY)
  ctx.font = '800 48px system-ui'
  ctx.fillText(lastName, nameX, nameY + 55)

  // Badge "MEMBRE ACTIF"
  roundRect(ctx, nameX, nameY + 70, 170, 30, 15)
  ctx.fillStyle = 'rgba(30, 215, 96, 0.15)'
  ctx.fill()
  ctx.font = '600 12px system-ui'
  ctx.fillStyle = '#1ed760'
  ctx.fillText('👥  MEMBRE ACTIF', nameX + 15, nameY + 90)

  // Cooperative
  ctx.font = '400 16px system-ui'
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillText(`🏢  COOPÉRATIVE : ${cooperativeName ?? '—'}`, nameX, nameY + 135)

  // === MEMBER ID (left, below photo) ===
  ctx.font = '500 13px system-ui'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText('MEMBER ID', 80, 430)
  ctx.font = '700 28px ui-monospace, monospace'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(card.card_number, 80, 465)
  // Small verified dot
  ctx.beginPath()
  ctx.arc(80 + ctx.measureText(card.card_number).width + 15, 458, 6, 0, Math.PI * 2)
  ctx.fillStyle = '#1ed760'
  ctx.fill()

  // === INFO BLOCKS (4 blocks in a row) ===
  const blockY = 520, blockH = 130, blockW = 200, blockGap = 20
  const blocks = [
    { icon: '📍', label: 'LOCALITÉ', value: [card.member?.village, card.member?.canton, card.member?.prefecture, card.member?.region].filter(Boolean).join(', ') || '—' },
    { icon: '📞', label: 'TÉLÉPHONE', value: card.member?.phone ?? '—' },
    { icon: '🏢', label: 'COOPÉRATIVE', value: cooperativeName ?? '—' },
    { icon: '🌿', label: 'FAÎTIÈRE', value: faitiereName ?? '—' },
  ]

  blocks.forEach((block, i) => {
    const x = 60 + i * (blockW + blockGap)
    roundRect(ctx, x, blockY, blockW, blockH, 16)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Icon circle
    ctx.beginPath()
    ctx.arc(x + blockW / 2, blockY + 35, 22, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(30, 215, 96, 0.1)'
    ctx.fill()
    ctx.font = '20px system-ui'
    ctx.fillText(block.icon, x + blockW / 2 - 10, blockY + 42)

    // Label
    ctx.font = '600 10px system-ui'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.textAlign = 'center'
    ctx.fillText(block.label, x + blockW / 2, blockY + 75)

    // Value
    ctx.font = '500 12px system-ui'
    ctx.fillStyle = '#ffffff'
    const val = block.value.length > 22 ? block.value.slice(0, 22) + '…' : block.value
    ctx.fillText(val, x + blockW / 2, blockY + 95)
    ctx.textAlign = 'left'

    // Bottom accent line
    roundRect(ctx, x + blockW / 2 - 15, blockY + blockH - 15, 30, 3, 2)
    ctx.fillStyle = '#1ed760'
    ctx.fill()
  })

  // === QR CODE (right side) ===
  const qrBlockX = W - 300, qrBlockY = 420
  roundRect(ctx, qrBlockX, qrBlockY, 250, 260, 20)
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.stroke()

  ctx.font = '600 11px system-ui'
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.textAlign = 'center'
  ctx.fillText('SCAN TO VERIFY', qrBlockX + 125, qrBlockY + 25)
  ctx.textAlign = 'left'

  // QR
  const matrix = toMatrix(qrPayload, 'M')
  const qrSize = 160
  const qrX = qrBlockX + 45, qrY = qrBlockY + 40
  roundRect(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 12)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // Green halo
  ctx.save()
  ctx.shadowColor = 'rgba(30, 215, 96, 0.3)'
  ctx.shadowBlur = 15
  roundRect(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 12)
  ctx.strokeStyle = 'rgba(30, 215, 96, 0.3)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()

  const cellSize = qrSize / matrix.length
  ctx.fillStyle = '#0a2e1a'
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix.length; col++) {
      if (matrix[row][col]) {
        ctx.fillRect(qrX + col * cellSize, qrY + row * cellSize, cellSize + 0.3, cellSize + 0.3)
      }
    }
  }

  // "SECURE • VERIFIED • TRUSTED"
  ctx.font = '500 9px system-ui'
  ctx.fillStyle = '#1ed760'
  ctx.textAlign = 'center'
  ctx.fillText('✓ SECURE • VERIFIED • TRUSTED', qrBlockX + 125, qrBlockY + 240)
  ctx.textAlign = 'left'

  // === DIGITAL SIGNATURE (left bottom) ===
  ctx.font = 'italic 24px "Brush Script MT", cursive, system-ui'
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText('FaîtiereHub', 80, 730)
  ctx.font = '500 10px system-ui'
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText('DIGITAL SIGNATURE', 80, 750)

  // === FOOTER BAR ===
  roundRect(ctx, 30, H - 110, W - 60, 80, 16)
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.stroke()

  // Valid until
  ctx.font = '400 11px system-ui'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText('📅  VALID UNTIL', 60, H - 75)
  const expiryText = card.expiry_date
    ? new Date(card.expiry_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
    : '—'
  ctx.font = '700 22px system-ui'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(expiryText, 60, H - 48)

  // Membership status + progress bar
  ctx.font = '500 11px system-ui'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText('MEMBERSHIP STATUS', 400, H - 75)
  ctx.font = '700 20px system-ui'
  ctx.fillStyle = '#1ed760'
  ctx.fillText('ACTIVE', 400, H - 48)

  // Progress bar
  const barX = 520, barY = H - 58, barW = 150, barH = 8
  roundRect(ctx, barX, barY, barW, barH, 4)
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fill()
  let progress = 1
  if (card.expiry_date) {
    const now = Date.now()
    const created = new Date(card.created_at).getTime()
    const expiry = new Date(card.expiry_date).getTime()
    progress = Math.max(0, Math.min(1, 1 - (now - created) / (expiry - created)))
  }
  roundRect(ctx, barX, barY, barW * progress, barH, 4)
  ctx.fillStyle = '#1ed760'
  ctx.fill()
  // Green dot
  ctx.beginPath()
  ctx.arc(barX + barW * progress, barY + barH / 2, 5, 0, Math.PI * 2)
  ctx.fill()

  // Membership period (right)
  ctx.font = '500 11px system-ui'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.textAlign = 'right'
  ctx.fillText('MEMBERSHIP PERIOD', W - 70, H - 75)
  const startYear = new Date(card.created_at).getFullYear()
  const endYear = card.expiry_date ? new Date(card.expiry_date).getFullYear() : startYear + 3
  ctx.font = '700 18px system-ui'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`${startYear} - ${endYear}`, W - 70, H - 48)
  // Checkmark
  ctx.beginPath()
  ctx.arc(W - 180, H - 60, 14, 0, Math.PI * 2)
  ctx.fillStyle = '#1ed760'
  ctx.fill()
  ctx.font = '700 12px system-ui'
  ctx.fillStyle = '#fff'
  ctx.fillText('✓', W - 185, H - 55)
  ctx.textAlign = 'left'

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to create card image'))
    }, 'image/png')
  })
}

export async function downloadCardImage(opts: RenderOptions, filename?: string) {
  const blob = await renderCardImage(opts)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `carte-membre-${opts.card.card_number}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
