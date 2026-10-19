'use client'

import {
  type CardLevel,
  PLATFORM_LOGO_PATH,
  buildCardSchema,
  inlineImage,
  renderCardSvg,
} from '@/lib/card-engine'
import { useEffect, useMemo, useState } from 'react'

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
  /** `AAAA-MM-JJ` ; à défaut, un an à compter de la date du jour. */
  expiryDate?: string
  createdAt?: string
  cooperativeName?: string
  organisationId?: string | null
  organisationLevel?: string | null
  unionName?: string | null
  faitiereName?: string | null
  cooperativeLogoUrl?: string | null
  faitiereLogoUrl?: string | null
  /** Niveau réel ; `null` : « — » (aucun niveau inventé). */
  level?: CardLevel | null
  /** Couleur principale et couleur d'accent (déjà résolues : modèle enregistré ou organisation). */
  brandColor?: string | null
  accentColor?: string | null
  template?: { title: string; subtitle: string }
  className?: string
}

/** Date `AAAA-MM-JJ` locale décalée d'un nombre de jours, sans passer par l'UTC. */
function isoDateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Aperçu inline de la carte de membre (face unique).
 *
 * Même `renderCardSvg` que l'export PNG, le PDF et la feuille A4 : ce que l'on
 * voit est ce qui sort. Les valeurs par défaut sont des libellés de
 * remplissage évidents (« Prénom », « NOM »), jamais un faux membre.
 */
export function CardSvgPreview({
  firstName = 'Prénom',
  lastName = 'NOM',
  phone = '',
  photoUrl = null,
  village = 'Village',
  canton = 'Canton',
  prefecture = 'Préfecture',
  region = 'Région',
  cardNumber = 'N° à l’émission',
  expiryDate,
  createdAt,
  cooperativeName = 'Coopérative',
  organisationId = null,
  organisationLevel = null,
  unionName = null,
  faitiereName = null,
  cooperativeLogoUrl = null,
  faitiereLogoUrl = null,
  level = null,
  brandColor = null,
  accentColor = null,
  template,
  className = '',
}: CardSvgPreviewProps) {
  // Les images doivent être intégrées : le SVG est injecté tel quel dans la page
  // et sert aussi de modèle d'export. On mesure les logos à cette occasion.
  const [photo, setPhoto] = useState<string | null>(null)
  const [coopLogo, setCoopLogo] = useState<{ url: string; aspect: number | null } | null>(null)
  const [faitiereLogo, setFaitiereLogo] = useState<{ url: string; aspect: number | null } | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false
    if (!photoUrl) {
      setPhoto(null)
      return
    }
    inlineImage(photoUrl).then((v) => {
      if (!cancelled) setPhoto(v?.dataUrl ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [photoUrl])

  useEffect(() => {
    let cancelled = false
    if (!cooperativeLogoUrl) {
      setCoopLogo(null)
      return
    }
    inlineImage(cooperativeLogoUrl, { maxBytes: 512_000 }).then((v) => {
      if (!cancelled) setCoopLogo(v ? { url: v.dataUrl, aspect: v.aspect } : null)
    })
    return () => {
      cancelled = true
    }
  }, [cooperativeLogoUrl])

  useEffect(() => {
    let cancelled = false
    if (!faitiereLogoUrl) {
      setFaitiereLogo(null)
      return
    }
    inlineImage(faitiereLogoUrl, { maxBytes: 512_000 }).then((v) => {
      if (!cancelled) setFaitiereLogo(v ? { url: v.dataUrl, aspect: v.aspect } : null)
    })
    return () => {
      cancelled = true
    }
  }, [faitiereLogoUrl])

  const svg = useMemo(() => {
    const schema = buildCardSchema({
      member: {
        first_name: firstName,
        last_name: lastName,
        phone,
        photo_url: photo,
        village,
        canton,
        prefecture,
        region,
      },
      cardNumber,
      expiryDate: expiryDate ?? isoDateOffset(365),
      createdAt: createdAt ?? isoDateOffset(0),
      status: 'active',
      cooperativeName,
      organisationId,
      organisationLevel,
      unionName,
      faitiereName,
      cooperativeLogoUrl: coopLogo?.url ?? null,
      cooperativeLogoAspect: coopLogo?.aspect ?? null,
      faitiereLogoUrl: faitiereLogo?.url ?? null,
      faitiereLogoAspect: faitiereLogo?.aspect ?? null,
      brandColor,
      accentColor,
      level,
      template,
    })
    // SVG inséré dans la page : le logo FaîtiereHub se charge par son URL.
    return renderCardSvg(schema, {
      mode: 'screen',
      photoDataUrl: photo,
      platformLogo: PLATFORM_LOGO_PATH,
    })
  }, [
    firstName,
    lastName,
    phone,
    photo,
    village,
    canton,
    prefecture,
    region,
    cardNumber,
    expiryDate,
    createdAt,
    cooperativeName,
    organisationId,
    organisationLevel,
    unionName,
    faitiereName,
    coopLogo,
    faitiereLogo,
    brandColor,
    accentColor,
    level,
    template,
  ])

  return (
    <div
      className={`mx-auto w-full max-w-2xl [&>svg]:block [&>svg]:h-auto [&>svg]:w-full [&>svg]:drop-shadow-sm ${className}`}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG produit par renderCardSvg, qui échappe chaque interpolation (esc dans lib/card-engine/security-art.ts)
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
