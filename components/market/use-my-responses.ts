'use client'

/**
 * Ce que le compte connecté a déjà fait sur chaque annonce (réponse envoyée, retenue,
 * invitation…), pour remplacer « Je suis intéressé » par où il en est.
 */
import { useAuth } from '@/app/context/auth-context'
import { type Activity, type ResponseStatus, activity, isError } from '@/lib/market/client'
import { useCallback, useEffect, useState } from 'react'

export function useMyResponses() {
  const { user } = useAuth()
  const [byAnnouncement, setByAnnouncement] = useState<Record<string, ResponseStatus>>({})
  const [mine, setMine] = useState<Activity | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setByAnnouncement({})
      setMine(null)
      return
    }
    const result = await activity()
    if (isError(result)) return
    setMine(result)
    setByAnnouncement(
      Object.fromEntries(result.sent.map((r) => [r.announcement.id, r.status] as const)),
    )
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const record = useCallback((announcementId: string, status: ResponseStatus) => {
    setByAnnouncement((current) => ({ ...current, [announcementId]: status }))
  }, [])

  return { byAnnouncement, activity: mine, record, refresh, signedIn: Boolean(user) }
}
