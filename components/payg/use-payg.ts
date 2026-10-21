'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, withPartner } from './api'
import type { PaygMe } from './types'

/**
 * Contexte PAYG du compte : opérateur courant, rôle, portefeuille partagé, coopératives,
 * formation. L'opérateur choisi est gardé dans l'URL (?partner=) pour qu'un lien partagé
 * ou un retour de paiement rouvre le bon compte.
 */
export function usePayg() {
  const [me, setMe] = useState<PaygMe | null>(null)
  const [error, setError] = useState<{ status: number; message: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [partnerId, setPartnerId] = useState<string | undefined>(undefined)

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('partner') ?? undefined
    setPartnerId(wanted)
  }, [])

  const load = useCallback(async (id?: string) => {
    setLoading(true)
    const res = await api<PaygMe>(withPartner('/api/payg/me', id))
    if (res.ok) {
      setMe(res.data)
      setError(null)
    } else {
      setError({ status: res.status, message: res.error })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load(partnerId)
  }, [load, partnerId])

  const switchPartner = (id: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('partner', id)
    window.history.replaceState(null, '', url.toString())
    setPartnerId(id)
  }

  return {
    me,
    error,
    loading,
    partnerId: me?.current?.partner_id,
    reload: () => load(me?.current?.partner_id ?? partnerId),
    switchPartner,
  }
}
