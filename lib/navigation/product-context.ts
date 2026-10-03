'use client'

/**
 * Espace affiché dans la navigation : FaîtiereHub (organisations) ou Haroo
 * (opportunités). Ce n'est PAS un changement de compte : la même identité sert
 * aux deux. Mémorisé pour la session (sessionStorage) ; sans choix, déduit de
 * la page courante.
 */

import { useCallback, useEffect, useState } from 'react'

export type ProductContext = 'faitierehub' | 'haroo'

const KEY = 'fh:product-context'
const HAROO_PATHS = ['/haroo', '/marche']

export function contextFromPath(pathname: string | null): ProductContext {
  return pathname && HAROO_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
    ? 'haroo'
    : 'faitierehub'
}

export function useProductContext(pathname: string | null) {
  const [context, setContextState] = useState<ProductContext>(() => contextFromPath(pathname))

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY)
      if (saved === 'haroo' || saved === 'faitierehub') setContextState(saved)
    } catch {
      // stockage indisponible (navigation privée) : on garde la déduction par page
    }
  }, [])

  const setContext = useCallback((next: ProductContext) => {
    setContextState(next)
    try {
      sessionStorage.setItem(KEY, next)
    } catch {
      // idem
    }
  }, [])

  return [context, setContext] as const
}
