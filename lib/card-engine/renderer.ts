/**
 * Card Renderer Engine — Deterministic Canvas Renderer
 * 
 * RULE: This renderer reads ONLY the CardSchema.
 * Same schema → same output. Always. Everywhere.
 * Preview === Export === Print.
 * 
 * No external state, no CSS, no DOM dependencies (except Canvas API).
 */

import type { CardSchema } from './schema'
import { toMatrix } from '@/lib/utils/qr'

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Main Renderer ──────────────────────────────────────────────────────────

/**
 * Render a card from its schema to a Canvas.
 * Returns the canvas element (can be used for preview or export).
 */
export async function renderToCanvas(schema: CardSchema): Promise<HTMLCanvasElement> {
  const { canvas: canvasDims, background, branding, member, styles } = schema
  const W = canvasDims.width
  const H = canvasDims.height
  const accent = styles.accentColor
  const font = styles.fontFamily

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // ═══ BACKGROUND ═══
  if (background.type === 'gradient' && background.gradient) {
    const bg = ctx.createLinearGradient(0, 0, W, H)
    for (const stop of background.gradient) {
      bg.addColorStop(stop.offset, stop.color)
    }
    ctx.fillStyle = bg
  } else {
    ctx.fillStyle = background.color ?? '#0a2e1a'
  }
  ctx.fillRect(0, 0, W, H)

  // Decorative organic shapes
  ctx.save()
  ctx.globalAlpha = 0.04
  ctx.fillStyle = accent
  ctx.beginPath(); ctx.ellipse(W * 0.9, 80, 200, 100, -0.3, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(50, H * 0.7, 150, 80, 0.5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(W * 0.5, H - 50, 300, 60, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = accent
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(W - 100, -200, 400, 0.3, 1.2); ctx.stroke()
  ctx.beginPath(); ctx.arc(W - 50, -250, 450, 0.3, 1.1); ctx.stroke()
  ctx.restore()

  // ═══ HEADER BAR ═══
  roundRect(ctx, 30, 20, W - 60, 60, 12)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.font = `700 20px ${font}`
  ctx.fillStyle = accent
  ctx.fillText('🌿 FaîtiereHub', 55, 57)

  ctx.font = `400 14px ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillText("CARTE D'IDENTITÉ MEMBRE", 260, 50)
  ctx.font = `300 12px ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText(branding.faitiereName, 260, 68)

  // Verified badge
  roundRect(ctx, W - 250, 30, 200, 40, 20)
  ctx.fillStyle = `${accent}26`
  ctx.fill()
  ctx.strokeStyle = `${accent}66`
  ctx.stroke()
  ctx.font = `600 14px ${font}`
  ctx.fillStyle = accent
  ctx.fillText('✓  MEMBRE VÉRIFIÉ', W - 230, 56)

  // ═══ PHOTO ═══
  const photoX = 100, photoY = 160, photoR = 110

  ctx.beginPath()
  ctx.arc(photoX + photoR, photoY + photoR, photoR + 8, 0, Math.PI * 2)
  ctx.strokeStyle = `${accent}4D`
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.save()
  ctx.shadowColor = `${accent}66`
  ctx.shadowBlur = 25
  ctx.beginPath()
  ctx.arc(photoX + photoR, photoY + photoR, photoR + 4, 0, Math.PI * 2)
  ctx.strokeStyle = `${accent}33`
  ctx.lineWidth = 2
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
  ctx.fillStyle = accent
  ctx.fill()
  ctx.font = `700 16px ${font}`
  ctx.fillStyle = '#fff'
  ctx.fillText('✓', photoX + photoR * 1.6 - 6, photoY + photoR * 1.7 + 6)

  // ═══ MEMBER NAME ═══
  const nameX = 360, nameY = 180

  ctx.font = `300 38px ${font}`
  ctx.fillStyle = styles.textColor
  ctx.fillText(member.firstName.toLowerCase(), nameX, nameY)
  ctx.font = `800 48px ${font}`
  ctx.fillText(member.lastName.toUpperCase(), nameX, nameY + 55)

  // Badge
  roundRect(ctx, nameX, nameY + 70, 170, 30, 15)
  ctx.fillStyle = `${accent}26`
  ctx.fill()
  ctx.font = `600 12px ${font}`
  ctx.fillStyle = accent
  ctx.fillText('👥  MEMBRE ACTIF', nameX + 15, nameY + 90)

  // Cooperative
  ctx.font = `400 16px ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillText(`🏢  ${branding.cooperativeName}`, nameX, nameY + 135)

  // ═══ MEMBER ID ═══
  ctx.font = `500 13px ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText('NUMÉRO CARTE', 80, 430)
  ctx.font = `700 28px ui-monospace, monospace`
  ctx.fillStyle = styles.textColor
  ctx.fillText(member.cardNumber, 80, 465)
  ctx.beginPath()
  ctx.arc(80 + ctx.measureText(member.cardNumber).width + 15, 458, 6, 0, Math.PI * 2)
  ctx.fillStyle = accent
  ctx.fill()

  // ═══ INFO BLOCKS ═══
  const blockY = 520, blockH = 130, blockW = 200, blockGap = 20
  const blocks = [
    { icon: '📍', label: 'LOCALITÉ', value: member.locality || '—' },
    { icon: '📞', label: 'TÉLÉPHONE', value: member.phone || '—' },
    { icon: '🏢', label: 'COOPÉRATIVE', value: branding.cooperativeName },
    { icon: '🌿', label: 'FAÎTIÈRE', value: branding.faitiereName },
  ]

  blocks.forEach((block, i) => {
    const x = 60 + i * (blockW + blockGap)
    roundRect(ctx, x, blockY, blockW, blockH, 16)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(x + blockW / 2, blockY + 35, 22, 0, Math.PI * 2)
    ctx.fillStyle = `${accent}1A`
    ctx.fill()
    ctx.font = `20px ${font}`
    ctx.fillText(block.icon, x + blockW / 2 - 10, blockY + 42)

    ctx.font = `600 10px ${font}`
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.textAlign = 'center'
    ctx.fillText(block.label, x + blockW / 2, blockY + 75)

    ctx.font = `500 12px ${font}`
    ctx.fillStyle = styles.textColor
    const val = block.value.length > 22 ? block.value.slice(0, 22) + '…' : block.value
    ctx.fillText(val, x + blockW / 2, blockY + 95)
    ctx.textAlign = 'left'

    roundRect(ctx, x + blockW / 2 - 15, blockY + blockH - 15, 30, 3, 2)
    ctx.fillStyle = accent
    ctx.fill()
  })

  // ═══ QR CODE ═══
  const qrBlockX = W - 300, qrBlockY = 420
  roundRect(ctx, qrBlockX, qrBlockY, 250, 260, 20)
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.stroke()

  ctx.font = `600 11px ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.textAlign = 'center'
  ctx.fillText('SCANNER POUR VÉRIFIER', qrBlockX + 125, qrBlockY + 25)
  ctx.textAlign = 'left'

  const qrPayload = JSON.stringify({
    card: member.cardNumber,
    verify: `https://saas-one-teal-62.vercel.app/verify/${member.cardNumber}`,
    name: `${member.firstName} ${member.lastName}`,
    cooperative: branding.cooperativeName,
    faitiere: branding.faitiereName,
  })

  const matrix = toMatrix(qrPayload, 'M')
  const qrSize = 160
  const qrX = qrBlockX + 45, qrY = qrBlockY + 40
  roundRect(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 12)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  ctx.save()
  ctx.shadowColor = `${accent}4D`
  ctx.shadowBlur = 15
  roundRect(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 12)
  ctx.strokeStyle = `${accent}4D`
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

  ctx.font = `500 9px ${font}`
  ctx.fillStyle = accent
  ctx.textAlign = 'center'
  ctx.fillText('✓ SÉCURISÉ • VÉRIFIÉ • CERTIFIÉ', qrBlockX + 125, qrBlockY + 240)
  ctx.textAlign = 'left'

  // ═══ DIGITAL SIGNATURE ═══
  ctx.font = `italic 24px "Brush Script MT", cursive, ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText('FaîtiereHub', 80, 730)
  ctx.font = `500 10px ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText('SIGNATURE NUMÉRIQUE', 80, 750)

  // ═══ FOOTER BAR ═══
  roundRect(ctx, 30, H - 110, W - 60, 80, 16)
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.stroke()

  // Valid until
  ctx.font = `400 11px ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText('📅  VALIDE JUSQU\'AU', 60, H - 75)
  const expiryText = member.expiryDate
    ? new Date(member.expiryDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
    : '—'
  ctx.font = `700 22px ${font}`
  ctx.fillStyle = styles.textColor
  ctx.fillText(expiryText, 60, H - 48)

  // Status
  ctx.font = `500 11px ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText('STATUT ADHÉSION', 400, H - 75)
  ctx.font = `700 20px ${font}`
  ctx.fillStyle = accent
  ctx.fillText('ACTIF', 400, H - 48)

  // Progress bar
  const barX = 520, barY = H - 58, barW = 150, barH = 8
  roundRect(ctx, barX, barY, barW, barH, 4)
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fill()
  let progress = 1
  if (member.expiryDate && member.createdAt) {
    const now = Date.now()
    const created = new Date(member.createdAt).getTime()
    const expiry = new Date(member.expiryDate).getTime()
    progress = Math.max(0, Math.min(1, 1 - (now - created) / (expiry - created)))
  }
  roundRect(ctx, barX, barY, barW * progress, barH, 4)
  ctx.fillStyle = accent
  ctx.fill()
  ctx.beginPath()
  ctx.arc(barX + barW * progress, barY + barH / 2, 5, 0, Math.PI * 2)
  ctx.fill()

  // Period
  ctx.font = `500 11px ${font}`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.textAlign = 'right'
  ctx.fillText('PÉRIODE', W - 70, H - 75)
  const startYear = member.createdAt ? new Date(member.createdAt).getFullYear() : new Date().getFullYear()
  const endYear = member.expiryDate ? new Date(member.expiryDate).getFullYear() : startYear + 1
  ctx.font = `700 18px ${font}`
  ctx.fillStyle = styles.textColor
  ctx.fillText(`${startYear} - ${endYear}`, W - 70, H - 48)
  ctx.beginPath()
  ctx.arc(W - 180, H - 60, 14, 0, Math.PI * 2)
  ctx.fillStyle = accent
  ctx.fill()
  ctx.font = `700 12px ${font}`
  ctx.fillStyle = '#fff'
  ctx.fillText('✓', W - 185, H - 55)
  ctx.textAlign = 'left'

  return canvas
}

// ─── Export Functions ────────────────────────────────────────────────────────

/** Render schema to PNG Blob */
export async function renderToPng(schema: CardSchema): Promise<Blob> {
  const canvas = await renderToCanvas(schema)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to create PNG'))
    }, 'image/png')
  })
}

/** Render schema and trigger download */
export async function downloadCard(schema: CardSchema, filename?: string): Promise<void> {
  const blob = await renderToPng(schema)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `carte-${schema.member.cardNumber}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Render schema to a data URL (for preview in <img> tags) */
export async function renderToDataUrl(schema: CardSchema): Promise<string> {
  const canvas = await renderToCanvas(schema)
  return canvas.toDataURL('image/png')
}
