'use client'

import { useMemo, useState, useEffect } from 'react'
import { buildCardSchema, renderToSvgString } from '@/lib/card-engine'

interface CardSvgPreviewProps {
  firstName?: string
  lastName?: string
  phone?: string
  photoUrl?: string | null
  village?: string
  canton?: string
  prefecture?: string
  region?: string
  cardNumber?: string
  expiryDate?: string
  createdAt?: string
  cooperativeName?: string
  faitiereName?: string
  level?: 'or' | 'argent' | 'bronze'
  template?: {
    title: string
    subtitle: string
    bgColor: string
    accentColor: string
    textColor: string
  }
  className?: string
}

/**
 * Renders the SVG member card inline as a preview.
 * Uses the same renderToSvgString as the PNG export — what you see is what you get.
 */
export function CardSvgPreview({
  firstName = 'Prénom',
  lastName = 'NOM',
  phone = '+228 90 XX XX XX',
  photoUrl = null,
  village = 'Village',
  canton = 'Canton',
  prefecture = 'Préfecture',
  region = 'Région',
  cardNumber = 'COOP-12345',
  expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  createdAt = new Date().toISOString(),
  cooperativeName = 'Coopérative',
  faitiereName = 'FaîtiereHub',
  level = 'bronze',
  template,
  className = '',
}: CardSvgPreviewProps) {
  // Convert photo URL to base64 so it embeds correctly inside SVG innerHTML
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!photoUrl) { setPhotoDataUrl(null); return }
    let cancelled = false
    fetch(photoUrl, { mode: 'cors' })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => {
        if (!blob || cancelled) return
        const reader = new FileReader()
        reader.onloadend = () => { if (!cancelled) setPhotoDataUrl(reader.result as string) }
        reader.readAsDataURL(blob)
      })
      .catch(() => setPhotoDataUrl(null))
    return () => { cancelled = true }
  }, [photoUrl])

  const svgString = useMemo(() => {
    const schema = buildCardSchema({
      member: {
        first_name: firstName,
        last_name: lastName,
        phone,
        photo_url: photoUrl,
        village,
        canton,
        prefecture,
        region,
      },
      cardNumber,
      expiryDate,
      createdAt,
      cooperativeName,
      faitiereName,
      level,
      accentColor: template?.accentColor,
      template,
    })
    return renderToSvgString(schema, photoDataUrl)
  }, [firstName, lastName, phone, photoUrl, photoDataUrl, village, canton, prefecture, region, cardNumber, expiryDate, createdAt, cooperativeName, faitiereName, level, template])

  return (
    <div
      className={`w-full max-w-2xl mx-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  )
}
