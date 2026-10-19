'use client'

import { useEffect, useState } from 'react'
import { gameReturnPath, rememberGameReturn, rememberedGameReturn } from '@/lib/haroolife/entry'

/** Preserve the requested game across the existing FaîtiereHub registration steps. */
export function useGameReturn() {
  const [returnTo, setReturnTo] = useState<string | null>(null)
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('redirect')
    const requested = gameReturnPath(raw)
    if (requested) rememberGameReturn(requested)
    setReturnTo(raw ? requested : rememberedGameReturn())
  }, [])
  return returnTo
}
