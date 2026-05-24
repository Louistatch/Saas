'use client'

import { useEffect, useState } from 'react'
import { getMemberScore, getLevelColor, getLevelLabel, type MemberLevel, type MemberScore } from '@/lib/members/score'
import { Award } from 'lucide-react'

interface ScoreBadgeProps {
  memberId: string
  /** Show inline (small) or expanded (with details) */
  variant?: 'inline' | 'expanded'
  /** Optional: pass pre-fetched score to avoid extra request */
  initialScore?: MemberScore
}

const LEVEL_ICONS: Record<MemberLevel, string> = {
  Bronze: '🥉',
  Argent: '🥈',
  Or: '🥇',
}

/**
 * ScoreBadge — displays the member's level (Bronze/Argent/Or).
 * 
 * Accessible: uses aria-label for screen readers.
 * Colors: Bronze #CD7F32, Argent #A8A9AD, Or #FFD700.
 */
export function ScoreBadge({ memberId, variant = 'inline', initialScore }: ScoreBadgeProps) {
  const [score, setScore] = useState<MemberScore | null>(initialScore ?? null)
  const [loading, setLoading] = useState(!initialScore)

  useEffect(() => {
    if (initialScore) return
    let cancelled = false
    getMemberScore(memberId).then((result) => {
      if (!cancelled) {
        setScore(result)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [memberId, initialScore])

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-secondary/50 animate-pulse">
        <span className="h-3 w-8 bg-secondary/60 rounded" />
      </span>
    )
  }

  if (!score || !score.level) {
    return null
  }

  const color = getLevelColor(score.level)
  const label = getLevelLabel(score.level)
  const icon = LEVEL_ICONS[score.level]

  if (variant === 'inline') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border"
        style={{
          '--badge-color': color,
          borderColor: color,
          color: color,
          backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
        } as React.CSSProperties}
        aria-label={label}
        role="status"
      >
        <span aria-hidden>{icon}</span>
        {score.level}
      </span>
    )
  }

  // Expanded variant with details
  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{
        '--badge-color': color,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 5%, transparent)`,
      } as React.CSSProperties}
      aria-label={label}
      role="status"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5" style={{ color }} aria-hidden />
          <span className="font-semibold text-foreground">{label}</span>
        </div>
        <span className="text-2xl" aria-hidden>{icon}</span>
      </div>

      {/* Progress indicators */}
      {score.score_details && (
        <div className="space-y-2">
          <ProgressItem
            label="Cotisations payées (12 mois)"
            value={score.score_details.paid_cotisations_12m}
            target={1}
            met={score.score_details.criteria.bronze}
          />
          <ProgressItem
            label="Parcelles renseignées"
            value={score.score_details.parcelle_count}
            target={1}
            met={score.score_details.parcelle_count >= 1}
          />
          <ProgressItem
            label="Productions enregistrées"
            value={score.score_details.production_count}
            target={2}
            met={score.score_details.production_count >= 2}
          />
          <ProgressItem
            label="Campagnes consécutives"
            value={score.score_details.consecutive_campaigns}
            target={2}
            met={score.score_details.consecutive_campaigns >= 2}
          />
        </div>
      )}

      {/* Next level hint */}
      {score.level !== 'Or' && score.score_details && (
        <p className="text-xs text-muted-foreground pt-1">
          {score.level === 'Bronze' && !score.score_details.criteria.argent && (
            <>Pour passer <strong>Argent</strong> : ajoutez une parcelle et une production.</>
          )}
          {score.level === 'Argent' && !score.score_details.criteria.or && (
            <>Pour passer <strong>Or</strong> : 2 campagnes payées + 2 productions minimum.</>
          )}
        </p>
      )}
    </div>
  )
}

function ProgressItem({
  label,
  value,
  target,
  met,
}: {
  label: string
  value: number
  target: number
  met: boolean
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${met ? 'text-green-600' : 'text-muted-foreground'}`}>
        {met ? '✓' : ''} {value}/{target}
      </span>
    </div>
  )
}
