/**
 * Card Renderer Engine — Premium Design (matches GPT reference)
 * 
 * Design: Dark green gradient with organic leaf shapes,
 * white info blocks, large circular photo, white QR block,
 * white verified badge, cursive signature.
 * 
 * Canvas: 1600x1000 (16:10)
 */

import type { CardSchema } from './schema'
import { toMatrix } from '@/lib/utils/qr'

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

export async function renderToCanvas(schema: CardSchema): Promise<HTMLCanvasElement> {
  const { canvas: canvasDims, background, branding, member, styles } = schema
  const W = canvasDims.width
  const H = canvasDims.height
  const accent = '#1ed760'
  const font = styles.fontFamily

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // ═══ BACKGROUND: Rich dark green gradient ═══
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0B3D2E')
  bg.addColorStop(0.5, '#0A4D35')
  bg.addColorStop(1, '#062A1E')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Organic leaf/curve decorations (top-right)
  ctx.save()
  ctx.globalAlpha = 0.08
  ctx.strokeStyle = '#2ECC71'
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.arc(W + 50, -100, 350, 0.8, 2.2); ctx.stroke()
  ctx.beginPath(); ctx.arc(W + 100, -150, 400, 0.8, 2.0); ctx.stroke()
  ctx.beginPath(); ctx.arc(W - 200, -200, 500, 0.6, 1.8); ctx.stroke()
  // Bottom-left curves
  ctx.beginPath(); ctx.arc(-100, H + 50, 300, -1.5, -0.3); ctx.stroke()
  ctx.beginPath(); ctx.arc(-50, H + 100, 350, -1.5, -0.5); ctx.stroke()
  ctx.restore()

  // Subtle leaf shapes
  ctx.save()
  ctx.globalAlpha = 0.04
  ctx.fillStyle = '#2ECC71'
  ctx.beginPath(); ctx.ellipse(W - 150, 100, 120, 50, -0.5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(100, H - 100, 100, 40, 0.3, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  // ═══ HEADER BAR ═══
  roundRect(ctx, 30, 20, W - 60, 70, 14)
  ctx.fillStyle = 'rgba(0,50,30,0.6)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Logo
  ctx.font = `700 24px ${font}`
  ctx.fillStyle = accent
  ctx.fillText('🌿 FaîtiereHub', 55, 63)

  // Separator line
  ctx.beginPath()
  ctx.moveTo(250, 35)
  ctx.lineTo(250, 75)
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Header text
  ctx.font = `600 16px ${font}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText('MEMBER IDENTITY PASS', 275, 52)
  ctx.font = `400 13px ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillText(branding.faitiereName, 275, 72)

  // Verified badge (white background)
  roundRect(ctx, W - 280, 28, 230, 50, 25)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  // Green checkmark circle
  ctx.beginPath()
  ctx.arc(W - 250, 53, 16, 0, Math.PI * 2)
  ctx.fillStyle = accent
  ctx.fill()
  ctx.font = `700 14px ${font}`
  ctx.fillStyle = '#fff'
  ctx.fillText('✓', W - 256, 58)
  // Text
  ctx.font = `700 15px ${font}`
  ctx.fillStyle = '#0B6B3A'
  ctx.fillText('VERIFIED MEMBER', W - 225, 58)

  // ═══ PHOTO (large, left side) ═══
  const photoX = 70, photoY = 140, photoR = 130

  // Outer ring (green glow)
  ctx.save()
  ctx.shadowColor = 'rgba(30, 215, 96, 0.4)'
  ctx.shadowBlur = 20
  ctx.beginPath()
  ctx.arc(photoX + photoR, photoY + photoR, photoR + 6, 0, Math.PI * 2)
  ctx.strokeStyle = accent
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.restore()

  // Photo clip
  ctx.save()
  ctx.beginPath()
  ctx.arc(photoX + photoR, photoY + photoR, photoR, 0, Math.PI * 2)
  ctx.clip()

  let photoLoaded = false
  if (member.photoUrl) {
    const img = await loadImage(member.photoUrl)
    if (img) {
      const size = photoR * 2
      ctx.drawImage(img, photoX, photoY, size, size)
      photoLoaded = true
    }
  }
  if (!photoLoaded) {
    ctx.fillStyle = '#1a4d2b'
    ctx.fillRect(photoX, photoY, photoR * 2, photoR * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.beginPath(); ctx.arc(photoX + photoR, photoY + 80, 35, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(photoX + photoR, photoY + 170, 50, 35, 0, Math.PI, 0, true); ctx.fill()
  }
  ctx.restore()

  // Blue checkmark on photo
  ctx.beginPath()
  ctx.arc(photoX + photoR + 80, photoY + photoR + 90, 22, 0, Math.PI * 2)
  ctx.fillStyle = '#3B82F6'
  ctx.fill()
  ctx.font = `700 18px ${font}`
  ctx.fillStyle = '#fff'
  ctx.fillText('✓', photoX + photoR + 72, photoY + photoR + 97)

  // ═══ MEMBER NAME (right of photo) ═══
  const nameX = 380, nameY = 170

  ctx.font = `300 42px ${font}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(member.firstName.toLowerCase(), nameX, nameY)
  ctx.font = `800 56px ${font}`
  ctx.fillText(member.lastName.toUpperCase(), nameX, nameY + 65)

  // Badge "MEMBRE ACTIF" (green pill)
  roundRect(ctx, nameX, nameY + 85, 200, 36, 18)
  ctx.fillStyle = 'rgba(30, 215, 96, 0.15)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(30, 215, 96, 0.4)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = `600 14px ${font}`
  ctx.fillStyle = accent
  ctx.fillText('👥  MEMBRE ACTIF', nameX + 20, nameY + 108)

  // Cooperative line
  ctx.font = `400 18px ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillText(`🏢  COOPÉRATIVE : ${branding.cooperativeName}`, nameX, nameY + 160)

  // ═══ INFO BLOCKS (white/cream background) ═══
  const blockY = 500, blockH = 140, blockW = 210, blockGap = 18, blockStartX = 55
  const blocks = [
    { icon: '📍', label: 'LOCALITÉ', value: member.locality || '—' },
    { icon: '📞', label: 'TÉLÉPHONE', value: member.phone || '—' },
    { icon: '🏢', label: 'COOPÉRATIVE', value: branding.cooperativeName },
    { icon: '🌿', label: 'FAÎTIÈRE', value: branding.faitiereName },
  ]

  blocks.forEach((block, i) => {
    const x = blockStartX + i * (blockW + blockGap)

    // White card with subtle shadow
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.15)'
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 4
    roundRect(ctx, x, blockY, blockW, blockH, 16)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fill()
    ctx.restore()

    roundRect(ctx, x, blockY, blockW, blockH, 16)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Icon circle (green bg)
    ctx.beginPath()
    ctx.arc(x + blockW / 2, blockY + 38, 24, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(30, 215, 96, 0.15)'
    ctx.fill()
    ctx.font = `22px ${font}`
    ctx.textAlign = 'center'
    ctx.fillText(block.icon, x + blockW / 2, blockY + 46)

    // Label
    ctx.font = `700 11px ${font}`
    ctx.fillStyle = accent
    ctx.fillText(block.label, x + blockW / 2, blockY + 80)

    // Value
    ctx.font = `500 13px ${font}`
    ctx.fillStyle = '#ffffff'
    const val = block.value.length > 20 ? block.value.slice(0, 20) + '…' : block.value
    ctx.fillText(val, x + blockW / 2, blockY + 102)

    // Bottom accent line
    roundRect(ctx, x + blockW / 2 - 18, blockY + blockH - 18, 36, 4, 2)
    ctx.fillStyle = accent
    ctx.fill()
    ctx.textAlign = 'left'
  })

  // ═══ MEMBER ID (left, below photo) ═══
  ctx.font = `500 14px ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText('MEMBER ID', 80, 445)
  ctx.font = `700 32px ui-monospace, monospace`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(member.cardNumber, 80, 480)
  // Green dot
  ctx.beginPath()
  ctx.arc(80 + ctx.measureText(member.cardNumber).width + 15, 473, 7, 0, Math.PI * 2)
  ctx.fillStyle = accent
  ctx.fill()

  // ═══ QR CODE (white block, right side) ═══
  const qrBlockX = W - 320, qrBlockY = 380
  // White background with shadow
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.2)'
  ctx.shadowBlur = 15
  ctx.shadowOffsetY = 5
  roundRect(ctx, qrBlockX, qrBlockY, 270, 280, 20)
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.fill()
  ctx.restore()

  // "SCAN TO VERIFY" header
  ctx.font = `700 12px ${font}`
  ctx.fillStyle = '#0B3D2E'
  ctx.textAlign = 'center'
  ctx.fillText('SCAN TO VERIFY', qrBlockX + 135, qrBlockY + 28)
  ctx.textAlign = 'left'

  // QR code
  const qrPayload = `https://www.faitierehub.com/verify/${encodeURIComponent(member.cardNumber)}`
  const matrix = toMatrix(qrPayload, 'M')
  const qrSize = 170
  const qrX = qrBlockX + 50, qrY = qrBlockY + 45

  const cellSize = qrSize / matrix.length
  ctx.fillStyle = '#0B3D2E'
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix.length; col++) {
      if (matrix[row][col]) {
        ctx.fillRect(qrX + col * cellSize, qrY + row * cellSize, cellSize + 0.3, cellSize + 0.3)
      }
    }
  }

  // "SECURE • VERIFIED • TRUSTED"
  ctx.font = `600 10px ${font}`
  ctx.fillStyle = accent
  ctx.textAlign = 'center'
  ctx.fillText('✓ SECURE • VERIFIED • TRUSTED', qrBlockX + 135, qrBlockY + 258)
  ctx.textAlign = 'left'

  // ═══ DIGITAL SIGNATURE ═══
  ctx.font = `italic 28px "Brush Script MT", cursive, ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText('FaîtiereHub', 80, 720)
  ctx.font = `600 11px ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText('DIGITAL SIGNATURE', 80, 745)

  // ═══ FOOTER BAR ═══
  roundRect(ctx, 30, H - 120, W - 60, 90, 16)
  ctx.fillStyle = 'rgba(0,40,25,0.5)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.stroke()

  // Valid until
  ctx.font = `500 12px ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText('📅  VALID UNTIL', 60, H - 82)
  const expiryText = member.expiryDate
    ? new Date(member.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
    : '—'
  ctx.font = `700 26px ${font}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(expiryText, 60, H - 50)

  // Membership status + progress bar
  ctx.font = `500 12px ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText('MEMBERSHIP STATUS', 380, H - 82)
  ctx.font = `700 24px ${font}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText('ACTIVE', 380, H - 50)

  // Green dot next to ACTIVE
  ctx.beginPath()
  ctx.arc(470, H - 57, 6, 0, Math.PI * 2)
  ctx.fillStyle = accent
  ctx.fill()

  // Progress bar
  const barX = 500, barY = H - 62, barW = 160, barH = 10
  roundRect(ctx, barX, barY, barW, barH, 5)
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.fill()
  let progress = 1
  if (member.expiryDate && member.createdAt) {
    const now = Date.now()
    const created = new Date(member.createdAt).getTime()
    const expiry = new Date(member.expiryDate).getTime()
    progress = Math.max(0, Math.min(1, 1 - (now - created) / (expiry - created)))
  }
  roundRect(ctx, barX, barY, barW * progress, barH, 5)
  ctx.fillStyle = accent
  ctx.fill()

  // Membership period (right)
  ctx.textAlign = 'right'
  const startYear = member.createdAt ? new Date(member.createdAt).getFullYear() : new Date().getFullYear()
  const endYear = member.expiryDate ? new Date(member.expiryDate).getFullYear() : startYear + 1
  // Green checkmark circle
  ctx.beginPath()
  ctx.arc(W - 220, H - 65, 16, 0, Math.PI * 2)
  ctx.fillStyle = accent
  ctx.fill()
  ctx.font = `700 14px ${font}`
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.fillText('✓', W - 220, H - 60)
  ctx.textAlign = 'right'

  ctx.font = `700 22px ${font}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`${startYear} - ${endYear}`, W - 70, H - 55)
  ctx.font = `500 11px ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText('MEMBERSHIP PERIOD', W - 70, H - 80)
  ctx.textAlign = 'left'

  return canvas
}

// ─── Export Functions ────────────────────────────────────────────────────────

export async function renderToPng(schema: CardSchema): Promise<Blob> {
  const canvas = await renderToCanvas(schema)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to create PNG'))
    }, 'image/png')
  })
}

export async function downloadCard(schema: CardSchema, filename?: string): Promise<void> {
  const blob = await renderToPng(schema)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `carte-${schema.member.cardNumber}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function renderToDataUrl(schema: CardSchema): Promise<string> {
  const canvas = await renderToCanvas(schema)
  return canvas.toDataURL('image/png')
}
