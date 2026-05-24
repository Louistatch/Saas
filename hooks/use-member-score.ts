'use client'

import { useCallback, useEffect, useState } from 'react'
import { getMemberScore, type MemberScore } from '@/lib/members/score'

/**
 * Hook to fetch and auto-refresh member score.
 * Refreshes on mount and when `refreshKey` changes.
 */
export function useMemberScore(memberId: string | undefined) {
  const [score, setScore] = useState<MemberScore | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!memberId) {
      setScore(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const result = await getMemberScore(memberId)
    setScore(result)
    setIsLoading(false)
  }, [memberId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Listen for custom events to auto-refresh (fired after cotisation/parcelle changes)
  useEffect(() => {
    const handler = () => refresh()
    window.addEventListener('fh:score-refresh', handler)
    return () => window.removeEventListener('fh:score-refresh', handler)
  }, [refresh])

  return { score, isLoading, refresh }
}

/** Dispatch this event after any action that might change the score */
export function triggerScoreRefresh() {
  window.dispatchEvent(new CustomEvent('fh:score-refresh'))
}
