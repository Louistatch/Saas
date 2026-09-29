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
  cooperativeLogoUrl?: string | null
  faitiereLogoUrl?: string | null
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
  village = 'Village',
  canton = 'Canton',
  prefecture = 'Préfecture',
  region = 'Région',
  cardNumber = 'COOP-12345',
  expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  createdAt = new Date().toISOString(),
  cooperativeName = 'Coopérative',
  faitiereName = 'FaîtiereHub',
  cooperativeLogoUrl = null,
  faitiereLogoUrl = null,
  level = 'bronze',
  template,
  className = '',
}: CardSvgPreviewProps) {
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  // Logos must be inlined too: the same SVG string is handed to the PNG export
  // and to the server renderer, neither of which can follow an external URL.
  const [coopLogoData, setCoopLogoData] = useState<string | null>(null)
  const [faitiereLogoData, setFaitiereLogoData] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!photoUrl) { setPhotoDataUrl(null); return }
    urlToDataUrl(photoUrl).then((v) => { if (!cancelled) setPhotoDataUrl(v) })
    return () => { cancelled = true }
  }, [photoUrl])

  useEffect(() => {
    let cancelled = false
    if (!cooperativeLogoUrl) { setCoopLogoData(null); return }
    urlToDataUrl(cooperativeLogoUrl).then((v) => { if (!cancelled) setCoopLogoData(v) })
    return () => { cancelled = true }
  }, [cooperativeLogoUrl])

  useEffect(() => {
    let cancelled = false
    if (!faitiereLogoUrl) { setFaitiereLogoData(null); return }
    urlToDataUrl(faitiereLogoUrl).then((v) => { if (!cancelled) setFaitiereLogoData(v) })
    return () => { cancelled = true }
  }, [faitiereLogoUrl])

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
      cooperativeLogoUrl: coopLogoData,
      faitiereLogoUrl: faitiereLogoData,
      level,
      accentColor: template?.accentColor,
      template,
    })
    return renderToSvgString(schema, photoDataUrl)
  }, [firstName, lastName, phone, photoUrl, photoDataUrl, village, canton, prefecture, region, cardNumber, expiryDate, createdAt, cooperativeName, faitiereName, coopLogoData, faitiereLogoData, level, template])

  return (
    <div
      className={`w-full max-w-2xl mx-auto ${className}`}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG produit par renderToSvgString, qui echappe chaque interpolation (lib/card-engine/renderer.ts escapeXml)
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  )
}
