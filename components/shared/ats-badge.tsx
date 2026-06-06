'use client'

import { useState } from 'react'

export interface AtsBreakdown {
  cotisation: number
  production: number
  engagement: number
  anciennete: number
  parcelle: number
}

export interface AtsBadgeProps {
  score: number
  level: string
  breakdown?: AtsBreakdown
  size?: 'sm' | 'md' | 'lg'
}

const LEVEL_CONFIG: Record<string, {
  label: string
  color: string
  bg: string
  border: string
  shimmer: boolean
  emoji: string
}> = {
  starter: {
    label: 'Starter',
    color: '#9CA3AF',
    bg: 'rgba(156,163,175,0.10)',
    border: 'rgba(156,163,175,0.20)',
    shimmer: false,
    emoji: '🌱',
  },
  bronze: {
    label: 'Bronze',
    color: '#CD7F32',
    bg: 'rgba(205,127,50,0.12)',
    border: 'rgba(205,127,50,0.25)',
    shimmer: false,
    emoji: '🥉',
  },
  silver: {
    label: 'Argent',
    color: '#C0C0C0',
    bg: 'rgba(192,192,192,0.12)',
    border: 'rgba(192,192,192,0.25)',
    shimmer: false,
    emoji: '🥈',
  },
  gold: {
    label: 'Or',
    color: '#FFD700',
    bg: 'rgba(255,215,0,0.12)',
    border: 'rgba(255,215,0,0.25)',
    shimmer: false,
    emoji: '🌟',
  },
  platinum: {
    label: 'Platine',
    color: '#E5E4E2',
    bg: 'rgba(229,228,226,0.12)',
    border: 'rgba(229,228,226,0.30)',
    shimmer: true,
    emoji: '💎',
  },
}

const BREAKDOWN_LABELS: Record<keyof AtsBreakdown, { label: string; max: number; color: string }> = {
  cotisation: { label: 'Cotisations', max: 300, color: '#34D399' },
  production: { label: 'Production', max: 300, color: '#60A5FA' },
  engagement: { label: 'Engagement', max: 200, color: '#F59E0B' },
  anciennete: { label: 'Ancienneté', max: 100, color: '#A78BFA' },
  parcelle:   { label: 'Parcelles',  max: 100, color: '#FB923C' },
}

export function AtsBadge({ score, level, breakdown, size = 'md' }: AtsBadgeProps) {
  const [expanded, setExpanded] = useState(false)

  const cfg = LEVEL_CONFIG[level] ?? LEVEL_CONFIG.starter
  const pct = Math.min(100, Math.round((score / 1000) * 100))

  const sizeClasses = {
    sm: { wrap: 'px-2.5 py-1.5 rounded-xl', emoji: 'text-sm', score: 'text-sm font-bold', label: 'text-[10px]', barH: 'h-1' },
    md: { wrap: 'px-3 py-2 rounded-xl',     emoji: 'text-base', score: 'text-base font-bold', label: 'text-[11px]', barH: 'h-1.5' },
    lg: { wrap: 'px-4 py-3 rounded-2xl',    emoji: 'text-lg', score: 'text-lg font-bold', label: 'text-xs', barH: 'h-2' },
  }[size]

  return (
    <div className="space-y-2">
      {/* Main badge */}
      <button
        type="button"
        onClick={() => breakdown && setExpanded(v => !v)}
        className={`${sizeClasses.wrap} flex items-center gap-2.5 w-full text-left transition-all duration-200 active:scale-95`}
        style={{
          background: cfg.bg,
          border: `1px solid ${cfg.border}`,
          cursor: breakdown ? 'pointer' : 'default',
        }}
        aria-expanded={expanded}
      >
        {/* Emoji + level */}
        <span className={sizeClasses.emoji}>{cfg.emoji}</span>

        {/* Score + bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className={`${sizeClasses.score} leading-none`} style={{ color: cfg.color }}>
              {score} <span className="font-normal opacity-50 text-[0.7em]">/ 1000</span>
            </span>
            <span
              className={`${sizeClasses.label} font-bold uppercase tracking-widest`}
              style={{ color: cfg.color }}
            >
              {cfg.label}
            </span>
          </div>

          {/* Progress bar */}
          <div
            className={`w-full ${sizeClasses.barH} rounded-full overflow-hidden`}
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <div
              className={`h-full rounded-full transition-all duration-700 ${cfg.shimmer ? 'ats-shimmer' : ''}`}
              style={{
                width: `${pct}%`,
                background: cfg.shimmer
                  ? `linear-gradient(90deg, ${cfg.color}aa, ${cfg.color}, ${cfg.color}aa)`
                  : cfg.color,
              }}
            />
          </div>
        </div>

        {/* Expand chevron if breakdown available */}
        {breakdown && (
          <svg
            width="14" height="14" viewBox="0 0 14 14" fill="none"
            className={`shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            style={{ color: cfg.color, opacity: 0.6 }}
          >
            <path d="M2.5 5L7 9.5L11.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {/* Breakdown panel */}
      {breakdown && expanded && (
        <div
          className="rounded-xl px-3 py-3 space-y-2"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Détail du score ATS</p>
          {(Object.keys(BREAKDOWN_LABELS) as (keyof AtsBreakdown)[]).map(key => {
            const meta = BREAKDOWN_LABELS[key]
            const val = breakdown[key]
            const barPct = Math.min(100, Math.round((val / meta.max) * 100))
            return (
              <div key={key} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/60">{meta.label}</span>
                  <span className="text-[11px] font-semibold" style={{ color: meta.color }}>
                    {val} <span className="text-white/30 font-normal">/ {meta.max}</span>
                  </span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${barPct}%`, background: meta.color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Shimmer keyframe — injected once via style tag */}
      <style>{`
        @keyframes ats-shimmer-move {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .ats-shimmer {
          background-size: 200% 100%;
          animation: ats-shimmer-move 2.5s linear infinite;
        }
      `}</style>
    </div>
  )
}
