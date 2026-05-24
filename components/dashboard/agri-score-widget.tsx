'use client'

import { useMemberScore } from '@/hooks/use-member-score'
import { Award, ArrowRight, CheckCircle, Circle, Leaf, Coins, FileText, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import type { MemberLevel } from '@/lib/members/score'

interface AgriScoreWidgetProps {
  memberId: string | undefined
}

const LEVEL_CONFIG: Record<MemberLevel, { color: string; icon: string; next: MemberLevel | null; progress: number }> = {
  Bronze: { color: '#CD7F32', icon: '🥉', next: 'Argent', progress: 33 },
  Argent: { color: '#A8A9AD', icon: '🥈', next: 'Or', progress: 66 },
  Or: { color: '#FFD700', icon: '🥇', next: null, progress: 100 },
}

interface CriterionItem {
  met: boolean
  label: string
  href: string
}

export function AgriScoreWidget({ memberId }: AgriScoreWidgetProps) {
  const { score, isLoading } = useMemberScore(memberId)

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="h-5 w-40 bg-secondary/40 rounded animate-pulse" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-3 w-full bg-secondary/30 rounded-full animate-pulse" />
          <div className="h-4 w-3/4 bg-secondary/30 rounded animate-pulse" />
          <div className="h-4 w-2/3 bg-secondary/30 rounded animate-pulse" />
          <div className="h-4 w-1/2 bg-secondary/30 rounded animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  if (!score || !score.level) return null

  const config = LEVEL_CONFIG[score.level]
  const details = score.score_details

  // Build criteria list with actions
  const criteria: CriterionItem[] = [
    {
      met: (details?.paid_cotisations_12m ?? 0) >= 1,
      label: 'Au moins 1 cotisation payée (12 mois)',
      href: '/dashboard/cotisations',
    },
    {
      met: (details?.parcelle_count ?? 0) >= 1,
      label: 'Déclarer au moins 1 parcelle',
      href: '/dashboard/parcelles',
    },
    {
      met: (details?.production_count ?? 0) >= 1,
      label: 'Enregistrer au moins 1 production',
      href: '/dashboard/parcelles',
    },
    {
      met: (details?.production_count ?? 0) >= 2,
      label: '2 productions enregistrées (niveau Or)',
      href: '/dashboard/parcelles',
    },
    {
      met: (details?.consecutive_campaigns ?? 0) >= 2,
      label: 'Cotisations sur 2 campagnes (niveau Or)',
      href: '/dashboard/cotisations',
    },
  ]

  // Filter: show met criteria + first unmet ones for next level
  const metCriteria = criteria.filter(c => c.met)
  const unmetCriteria = criteria.filter(c => !c.met)

  return (
    <Card className="border-border overflow-hidden">
      {/* Colored top bar */}
      <div className="h-1.5" style={{ backgroundColor: config.color }} />

      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-base">
            <Award className="h-5 w-5" style={{ color: config.color }} />
            <span className="text-foreground">Votre profil agriculteur</span>
          </div>
          <span className="text-lg" aria-hidden>{config.icon}</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current level + progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold" style={{ color: config.color }}>
              Niveau {score.level}
            </span>
            {config.next && (
              <span className="text-xs text-muted-foreground">
                → {config.next}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div
            className="h-2.5 rounded-full bg-secondary/30 overflow-hidden"
            role="progressbar"
            aria-valuenow={config.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Niveau ${score.level} — ${config.progress}% de progression`}
          >
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${config.progress}%`, backgroundColor: config.color }}
            />
          </div>
        </div>

        {/* Criteria checklist */}
        <div className="space-y-2">
          {metCriteria.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
              <span className="text-muted-foreground line-through">{item.label}</span>
            </div>
          ))}
          {unmetCriteria.slice(0, 3).map((item, i) => (
            <Link
              key={i}
              href={item.href}
              className="flex items-center gap-2 text-sm group hover:bg-accent/5 rounded-lg px-2 py-1 -mx-2 transition-colors"
            >
              <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              <span className="text-foreground group-hover:text-primary transition-colors flex-1">
                {item.label}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
            </Link>
          ))}
        </div>

        {/* Or level: supplier directory link */}
        {score.level === 'Or' && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#FFD700]/5 border border-[#FFD700]/20">
              <Leaf className="h-4 w-4 text-[#FFD700] mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Vous êtes visible dans l&apos;annuaire fournisseurs certifiés
                </p>
                <Link href="/fournisseurs" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                  Voir l&apos;annuaire <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Quick actions for non-Or */}
        {score.level !== 'Or' && unmetCriteria.length > 0 && (
          <div className="pt-2">
            <Link href={unmetCriteria[0].href}>
              <Button size="sm" className="w-full gap-2 bg-primary hover:bg-primary/90 text-xs">
                {unmetCriteria[0].href.includes('parcelles') ? <Leaf className="h-3.5 w-3.5" /> :
                 unmetCriteria[0].href.includes('cotisations') ? <Coins className="h-3.5 w-3.5" /> :
                 <FileText className="h-3.5 w-3.5" />}
                {score.level === 'Bronze' ? 'Passer Argent' : 'Passer Or'} — {unmetCriteria[0].label.split(' ').slice(0, 3).join(' ')}…
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
