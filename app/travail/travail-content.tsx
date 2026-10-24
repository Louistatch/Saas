'use client'

/**
 * Travail agricole : deux vues sur la même page. « Offres de travail » est publique ; « Ouvriers
 * disponibles » demande un compte (prénom et initiale, compétences, note, cantons — jamais le
 * nom de famille ni le téléphone) et sert à inviter un ouvrier sur une offre.
 */
import { useAuth } from '@/app/context/auth-context'
import { AnnouncementBrowser } from '@/components/market/announcement-browser'
import { InviteWorker } from '@/components/market/invite-worker'
import { ProximityMark } from '@/components/market/proximity-mark'
import { useMyResponses } from '@/components/market/use-my-responses'
import { EMPTY_ZONE, ZoneSelect, type ZoneValue } from '@/components/market/zone-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { type AvailableWorker, availableWorkers, isError } from '@/lib/market/client'
import { PROXIMITY_LABEL } from '@/lib/market/work'
import { Lock, MapPin, Search, Star, UserRound } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

type View = 'offres' | 'ouvriers'

const SKILLS = ['Labour', 'Semis', 'Désherbage', 'Récolte', 'Traitement', 'Irrigation']

function WorkerCard({
  worker,
  offers,
  onInvited,
}: {
  worker: AvailableWorker
  offers: Parameters<typeof InviteWorker>[0]['offers']
  onInvited: () => void
}) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          <UserRound aria-hidden="true" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold">{worker.name}</h3>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            {worker.note !== null ? (
              <>
                <Star aria-hidden="true" className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                <span className="tabular-nums">{worker.note.toLocaleString('fr-FR')}</span>
                <span>· {worker.reviews} avis</span>
              </>
            ) : (
              'Pas encore d’avis'
            )}
          </p>
        </div>
      </div>

      {worker.skills.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Compétences">
          {worker.skills.map((s) => (
            <li
              key={s}
              className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize"
            >
              {s}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
        {worker.proximity < 3 ? (
          <ProximityMark rank={worker.proximity} className="h-4 w-4 text-primary" />
        ) : (
          <MapPin aria-hidden="true" className="h-4 w-4" />
        )}
        {worker.cantons.length > 0 ? worker.cantons.join(', ') : 'Canton non précisé'}
      </p>

      <div className="mt-auto pt-4">
        <InviteWorker worker={worker} offers={offers} onInvited={onInvited} />
      </div>
    </article>
  )
}

function AvailableWorkers() {
  const { user, isLoading } = useAuth()
  const pathname = usePathname()
  const [zone, setZone] = useState<ZoneValue>(EMPTY_ZONE)
  const [skill, setSkill] = useState('')
  const [workers, setWorkers] = useState<AvailableWorker[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const { activity, refresh } = useMyResponses()

  const openOffers = useMemo(
    () => (activity?.announcements ?? []).filter((a) => a.type === 'job' && a.open),
    [activity],
  )

  useEffect(() => {
    if (!user) return
    let alive = true
    setState('loading')
    const timer = setTimeout(
      () => {
        void availableWorkers({ ...zone, skill }).then((result) => {
          if (!alive) return
          if (isError(result)) {
            setWorkers([])
            setState('error')
          } else {
            setWorkers(result)
            setState('ready')
          }
        })
      },
      skill ? 350 : 0,
    )
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [user, zone, skill])

  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />

  if (!user) {
    return (
      <div className="rounded-2xl border border-border p-6 text-center sm:p-8">
        <Lock aria-hidden="true" className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-lg font-semibold">Connectez-vous pour voir les ouvriers</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Leur prénom, leurs compétences et leurs cantons ne sont montrés qu’aux comptes connectés.
          Leur numéro ne vous est donné que s’ils acceptent votre invitation.
        </p>
        <div className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-2">
          <Button asChild variant="outline" className="hover:bg-muted hover:text-foreground h-11">
            <Link href={`/auth/login?redirect=${encodeURIComponent(`${pathname}?vue=ouvriers`)}`}>
              Se connecter
            </Link>
          </Button>
          <Button asChild className="h-11">
            <Link href="/auth/signup/haroo">Créer un compte</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <MapPin aria-hidden="true" className="h-4 w-4 text-amber-700" /> Où est votre champ ?
        </p>
        <ZoneSelect value={zone} onChange={setZone} idPrefix="workers-zone" />
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Compétence recherchée"
            className="h-11 pl-10"
            placeholder="Compétence : récolte, labour…"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
          />
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {SKILLS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={skill.toLowerCase() === s.toLowerCase()}
              onClick={() =>
                setSkill((current) => (current.toLowerCase() === s.toLowerCase() ? '' : s))
              }
              className={`h-9 shrink-0 rounded-full border px-3 text-sm ${
                skill.toLowerCase() === s.toLowerCase()
                  ? 'border-amber-700 bg-amber-700 text-white'
                  : 'border-border bg-background'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {openOffers.length === 0 && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          Pour inviter un ouvrier, publiez d’abord une offre de travail.{' '}
          <Link
            href="/marche/publier?type=job"
            className="font-semibold underline underline-offset-2"
          >
            Publier une offre
          </Link>
        </p>
      )}

      <div className="mt-6" aria-live="polite" aria-busy={state === 'loading'}>
        {state === 'loading' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        ) : state === 'error' ? (
          <p className="rounded-2xl border border-border p-6 text-center text-sm text-muted-foreground">
            La liste n’a pas pu être chargée. Vérifiez votre connexion et réessayez.
          </p>
        ) : workers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
            <p className="text-lg font-semibold">Aucun ouvrier disponible ici pour l’instant</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Publiez votre offre de travail : les ouvriers qui s’inscrivent la verront, et vous
              recevrez leurs réponses dans Mon suivi.
            </p>
          </div>
        ) : (
          <>
            {zone.regionId && (
              <p className="mb-3 text-sm text-muted-foreground">
                Classés du plus proche au plus loin ({PROXIMITY_LABEL[0].toLowerCase()} d’abord).
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {workers.map((w) => (
                <WorkerCard
                  key={w.ref}
                  worker={w}
                  offers={openOffers}
                  onInvited={() => void refresh()}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function TravailContent() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [view, setView] = useState<View>(params.get('vue') === 'ouvriers' ? 'ouvriers' : 'offres')

  const choose = (next: View) => {
    setView(next)
    const query = new URLSearchParams(params.toString())
    if (next === 'ouvriers') query.set('vue', 'ouvriers')
    else query.delete('vue')
    const qs = query.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Offres ou ouvriers"
        className="mb-6 grid grid-cols-2 rounded-xl bg-muted p-1 sm:inline-grid sm:min-w-96"
      >
        {(
          [
            ['offres', 'Offres de travail'],
            ['ouvriers', 'Ouvriers disponibles'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`tab-${value}`}
            aria-selected={view === value}
            aria-controls={`panel-${value}`}
            onClick={() => choose(value)}
            className={`h-11 rounded-lg px-3 text-sm font-semibold transition-colors ${
              view === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>
        {view === 'offres' ? (
          <AnnouncementBrowser
            fixedType="job"
            publishHref="/marche/publier?type=job"
            publishLabel="Publier une offre de travail"
            searchPlaceholder="Travail, culture : récolte, maïs…"
            emptyTitle="Pas d’offre de travail ici pour l’instant"
            emptyText="Vous cherchez des bras ? Publiez une offre avec le salaire par jour : les ouvriers proches la verront en premier."
          />
        ) : (
          <AvailableWorkers />
        )}
      </div>
    </div>
  )
}
