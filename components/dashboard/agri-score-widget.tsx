'use client'

import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface AtsData {
  score: number
  level: string
}

const LEVEL_META: Record<string, { label: string; icon: string; color: string }> = {
  starter:  { label: 'Starter',  icon: '🌱', color: '#6B7280' },
  bronze:   { label: 'Bronze',   icon: '🥉', color: '#CD7F32' },
  silver:   { label: 'Argent',   icon: '🥈', color: '#A8A9AD' },
  gold:     { label: 'Or',       icon: '🥇', color: '#FFD700' },
  platinum: { label: 'Platine',  icon: '💎', color: '#06B6D4' },
}

interface AgriScoreWidgetProps {
  memberId: string | undefined
}

export function AgriScoreWidget({ memberId }: AgriScoreWidgetProps) {
  const [data, setData] = useState<AtsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!memberId) { setLoading(false); return }
    let cancelled = false
    fetch(`/api/members/${encodeURIComponent(memberId)}/ats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.score != null) setData({ score: d.score, level: d.level }) })
      .catch(() => null)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [memberId])

  const meta = data ? (LEVEL_META[data.level] ?? LEVEL_META.starter) : null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Score Agricole (ATS)</CardTitle>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading && <div className="h-8 w-24 rounded bg-secondary/50 animate-pulse" />}
        {!loading && !data && <p className="text-sm text-muted-foreground">Non disponible</p>}
        {!loading && data && meta && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold" style={{ color: meta.color }}>{data.score}</span>
              <span className="text-sm text-muted-foreground">/ 1000</span>
              <span className="ml-auto text-lg" aria-hidden>{meta.icon}</span>
            </div>
            <p className="text-xs font-medium" style={{ color: meta.color }}>{meta.label}</p>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, data.score / 10)}%`, backgroundColor: meta.color }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
