'use client'

import { useMemo, useState, useEffect } from 'react'
import { buildCardSchema, renderToSvgString } from '@/lib/card-engine'

interface CardSvgPreviewProps {
  firstName?: string
  lastName?: string
  phone?: string
  photoUrl?: string | null
  signatureUrl?: string | null
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

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { mode: 'cors' })
    if (!r.ok) return null
    const blob = await r.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
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
  signatureUrl = null,
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
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!photoUrl) { setPhotoDataUrl(null); return }
    urlToDataUrl(photoUrl).then((v) => { if (!cancelled) setPhotoDataUrl(v) })
    return () => { cancelled = true }
  }, [photoUrl])

  useEffect(() => {
    let cancelled = false
    if (!signatureUrl) { setSignatureDataUrl(null); return }
    urlToDataUrl(signatureUrl).then((v) => { if (!cancelled) setSignatureDataUrl(v) })
    return () => { cancelled = true }
  }, [signatureUrl])

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
  }, [firstName, lastName, phone, photoUrl, signatureUrl, photoDataUrl, signatureDataUrl, village, canton, prefecture, region, cardNumber, expiryDate, createdAt, cooperativeName, faitiereName, level, template])

  return (
    <div
      className={`w-full max-w-2xl mx-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  )
}
