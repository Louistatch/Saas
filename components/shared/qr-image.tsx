'use client'

import * as React from 'react'
import { toDataURL } from '@/lib/utils/qr'

interface QrImageProps {
  value: string
  size?: number
  margin?: number
  color?: string
  bg?: string
  className?: string
  alt?: string
}

/**
 * Renders a real QR code as an inline SVG data URL.
 * Memoizes the encoding so we don't recompute on every render.
 */
export function QrImage({
  value,
  size = 128,
  margin = 2,
  color = '#000000',
  bg = '#ffffff',
  className,
  alt = 'QR code',
}: QrImageProps) {
  const src = React.useMemo(
    () => toDataURL(value, { size, margin, color, bg }),
    [value, size, margin, color, bg],
  )
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} className={className} />
}
