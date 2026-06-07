'use client'

import { useEffect, useState } from 'react'

interface AtsSummary {
  score: number
  level: 'starter' | 'bronze' | 'silver' | 'gold' | 'platinum'
}

const LEVEL_META: Record<AtsSummary['level'], { label: string; icon: string; color: string }> = {
  starter:  { label: 'Starter',  icon: '🌱', color: '#6B7280' },
  bronze:   { label: 'Bronze',   icon: '🥉', color: '#CD7F32' },
  silver:   { label: 'Argent',   icon: '🥈', color: '#A8A9AD' },
  gold:     { label: 'Or',       icon: '🥇', color: '#FFD700' },
  platinum: { label: 'Platine',  icon: '💎', color: '#06B6D4' },
}

interface ScoreBadgeProps {
  memberId: string
  variant?: 'inline' | 'expanded'
}

export function ScoreBadge({ memberId, variant = 'inline' }: ScoreBadgeProps) {
  const [data, setData] = useState<AtsSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/members/${encodeURIComponent(memberId)}/ats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.score != null) setData({ score: d.score, level: d.level }) })
      .catch(() => null)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [memberId])

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-secondary/50 animate-pulse">
        <span className="h-3 w-8 bg-secondary/60 rounded" />
      </span>
    )
  }

  if (!data) return null

  const meta = LEVEL_META[data.level] ?? LEVEL_META.starter

  if (variant === 'inline') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border"
        style={{
          borderColor: meta.color,
          color: meta.color,
          backgroundColor: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
        }}
        aria-label={`Niveau ATS : ${meta.label} (${data.score} pts)`}
        role="status"
      >
        <span aria-hidden>{meta.icon}</span>
        {meta.label}
      </span>
    )
  }

  return (
    <div
      className="rounded-xl border p-4 space-y-2"
      style={{
        borderColor: `color-mix(in srgb, ${meta.color} 30%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${meta.color} 5%, transparent)`,
      }}
      role="status"
      aria-label={`Score ATS : ${data.score} pts — ${meta.label}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">{meta.label}</span>
        <span className="text-2xl" aria-hidden>{meta.icon}</span>
      </div>
      <p className="text-sm text-muted-foreground">Score : <strong style={{ color: meta.color }}>{data.score}</strong> / 1000</p>
    </div>
  )
}
