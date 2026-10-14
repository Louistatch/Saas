'use client'

// Le parcours de certification, dessiné comme une route : les étapes faites, celle en cours,
// celles à venir. La ligne se trace jusqu'à l'étape en cours (skill ui-motion : la donnée
// décide de la longueur, l'animation ne fait que la révéler) ; sans mouvement, elle est
// dessinée d'emblée à sa longueur finale.
import type { PartnerStatus } from '@/types/domain'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

export interface JourneyStep {
  title: string
  /** Ce qui s'est passé (étape faite) ou ce qu'il reste à faire (étape en cours). */
  detail?: string
  /** Action proposée sur l'étape en cours. */
  action?: ReactNode
}

/** Étape en cours (1 à 5) pour chaque statut ; 0 quand le parcours est fermé. */
export const STATUS_STEP: Record<PartnerStatus, number> = {
  candidate: 2,
  training: 2,
  exam_pending: 3,
  certified: 4,
  active: 5,
  suspended: 4,
  expired: 4,
  revoked: 0,
}

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : null

export function journeySteps(input: {
  status: PartnerStatus
  training_completed_at?: string | null
  exam_passed_at?: string | null
  certified_at?: string | null
  trainingAction?: ReactNode
  paymentAction?: ReactNode
}): JourneyStep[] {
  const trained = day(input.training_completed_at)
  const passed = day(input.exam_passed_at)
  const certified = day(input.certified_at)
  return [
    { title: 'Candidature', detail: 'Dossier enregistré' },
    {
      title: 'Formation en ligne',
      detail: trained ? `Terminée le ${trained}` : 'Gratuite, sur votre téléphone, à votre rythme',
      action: trained ? undefined : input.trainingAction,
    },
    {
      title: 'Évaluation pratique',
      detail: passed ? `Réussie le ${passed}` : "Sur le terrain, avec un opérateur de l'équipe",
    },
    {
      title: 'Frais de certification',
      detail: certified
        ? `Réglés le ${certified}`
        : '15 000 XOF, payés une seule fois, après l’évaluation',
      action: certified ? undefined : input.paymentAction,
    },
    { title: 'Opérateur actif', detail: 'Validation des dossiers, cartes, portefeuille' },
  ]
}

export function Journey({ steps, current }: { steps: JourneyStep[]; current: number }) {
  // La ligne va du centre du premier point au centre du point en cours.
  const progress = steps.length > 1 ? ((Math.max(current, 1) - 1) / (steps.length - 1)) * 100 : 0
  return (
    <ol className="relative" aria-label="Parcours de certification">
      <span
        aria-hidden
        className="absolute left-[13px] top-3 bottom-3 w-0.5 rounded-full bg-border"
      />
      <span
        aria-hidden
        key={current}
        className="route-line absolute left-[13px] top-3 w-0.5 rounded-full bg-primary"
        style={{ height: `calc(${progress}% - ${progress * 0.24}px)` }}
      />
      {steps.map((step, i) => {
        const n = i + 1
        const done = n < current
        const now = n === current
        return (
          <li key={step.title} className="relative flex gap-4 py-3 pl-9">
            <span
              aria-hidden
              className={`absolute left-0 top-3.5 flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                done
                  ? 'border-primary bg-primary text-primary-foreground'
                  : now
                    ? 'route-now border-primary bg-background text-primary'
                    : 'border-border bg-background text-muted-foreground'
              }`}
            >
              {done ? (
                <Check className="h-4 w-4 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300" />
              ) : (
                <span className="text-xs font-semibold">{n}</span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={
                  now
                    ? 'text-base font-semibold text-foreground'
                    : done
                      ? 'text-sm font-medium text-foreground'
                      : 'text-sm font-medium text-muted-foreground'
                }
              >
                {step.title}
                <span className="sr-only">
                  {done ? ', terminée' : now ? ', étape en cours' : ', à venir'}
                </span>
              </p>
              {step.detail && (
                <p
                  className={`mt-0.5 text-sm ${now ? 'text-foreground/80' : 'text-muted-foreground'}`}
                >
                  {step.detail}
                </p>
              )}
              {now && step.action && <div className="mt-3">{step.action}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
