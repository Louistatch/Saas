'use client'

/**
 * Une annonce du marché ou du travail. Ce qui décide d'un appel est en gros : le salaire par
 * jour d'une offre de travail, le prix au kilo d'une récolte. Le reste (lieu, dates, quantité)
 * suit en petit. Deux actions : répondre depuis le site, ou demander le numéro.
 */
import { ProximityMark } from '@/components/market/proximity-mark'
import { RespondButton } from '@/components/market/respond-dialog'
import { RevealPhone } from '@/components/market/reveal-phone'
import type { ResponseStatus } from '@/lib/market/client'
import {
  type MarketAnnouncement,
  PROXIMITY_LABEL,
  TYPE_LABEL,
  formatFcfa,
  formatQuantity,
  formatWorkDates,
  totalPay,
} from '@/lib/market/work'
import { Briefcase, CalendarDays, GraduationCap, MapPin, Sprout, Users, Wrench } from 'lucide-react'
import Link from 'next/link'

const TYPE_STYLE: Record<MarketAnnouncement['type'], { chip: string; icon: typeof Sprout }> = {
  prevente: { chip: 'bg-primary/10 text-primary', icon: Sprout },
  job: {
    chip: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
    icon: Briefcase,
  },
  mission: {
    chip: 'bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200',
    icon: GraduationCap,
  },
  autre: { chip: 'bg-muted text-foreground', icon: Wrench },
}

/** Le chiffre qui compte, et son unité. */
function Headline({ item }: { item: MarketAnnouncement }) {
  if (item.type === 'job' && item.wage_per_day_fcfa) {
    return (
      <p className="flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold tracking-tight tabular-nums">
          {item.wage_per_day_fcfa.toLocaleString('fr-FR')}
        </span>
        <span className="text-sm font-medium text-muted-foreground">FCFA / jour</span>
      </p>
    )
  }
  if (item.price_per_kg_fcfa) {
    return (
      <p className="flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold tracking-tight tabular-nums">
          {item.price_per_kg_fcfa.toLocaleString('fr-FR')}
        </span>
        <span className="text-sm font-medium text-muted-foreground">FCFA / kg</span>
      </p>
    )
  }
  return null
}

export function AnnouncementCard({
  item,
  status,
  onResponded,
  showProximity = true,
}: {
  item: MarketAnnouncement
  status?: ResponseStatus
  onResponded?: (status: ResponseStatus) => void
  showProximity?: boolean
}) {
  const style = TYPE_STYLE[item.type]
  const Icon = style.icon
  const place = [item.canton, item.prefecture].filter(Boolean).join(', ') || item.region
  const dates = item.type === 'job' ? formatWorkDates(item.starts_on, item.work_days) : null
  const pay = item.type === 'job' ? totalPay(item.wage_per_day_fcfa, item.work_days) : null
  const harvest =
    item.type === 'prevente' && item.starts_on
      ? new Date(`${item.starts_on}T12:00:00Z`).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        })
      : null

  return (
    <article className="flex h-full flex-col rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${style.chip}`}
        >
          <Icon aria-hidden="true" className="h-3.5 w-3.5" />
          {TYPE_LABEL[item.type]}
        </span>
        {showProximity && item.proximity < 3 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            <ProximityMark rank={item.proximity} className="h-3.5 w-3.5" />
            {PROXIMITY_LABEL[item.proximity].replace('Dans votre ', '')}
          </span>
        )}
      </div>

      <h3 className="mt-3 text-base font-bold leading-snug text-foreground">{item.title}</h3>

      <div className="mt-2">
        <Headline item={item} />
      </div>

      <dl className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        {item.type === 'job' && (item.positions ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Postes</dt>
            <Users aria-hidden="true" className="h-4 w-4 shrink-0" />
            <dd>
              {item.positions} ouvrier{(item.positions ?? 0) > 1 ? 's' : ''} recherché
              {(item.positions ?? 0) > 1 ? 's' : ''}
              {pay ? ` · ${formatFcfa(pay)} au total chacun` : ''}
            </dd>
          </div>
        )}
        {dates && (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Dates</dt>
            <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0" />
            <dd>{dates}</dd>
          </div>
        )}
        {(item.culture || item.quantity_kg) && (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Production</dt>
            <Sprout aria-hidden="true" className="h-4 w-4 shrink-0" />
            <dd>
              {[item.culture, item.quantity_kg ? formatQuantity(item.quantity_kg) : null]
                .filter(Boolean)
                .join(' · ')}
            </dd>
          </div>
        )}
        {harvest && (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Disponible</dt>
            <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0" />
            <dd>Disponible à partir du {harvest}</dd>
          </div>
        )}
        {place && (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Lieu</dt>
            <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
            <dd>{place}</dd>
          </div>
        )}
      </dl>

      {item.description && (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-foreground/80">
          {item.description}
        </p>
      )}

      <div className="mt-auto space-y-2 pt-4">
        {item.mine ? (
          <Link
            href="/marche/suivi"
            className="flex min-h-11 items-center justify-center rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Votre annonce · voir les réponses
          </Link>
        ) : (
          <>
            {item.accepts_responses && (
              <RespondButton announcement={item} status={status} onResponded={onResponded} />
            )}
            {item.has_contact && <RevealPhone announcementId={item.id} title={item.title} />}
          </>
        )}
      </div>
    </article>
  )
}
