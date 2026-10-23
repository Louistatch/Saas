'use client'

/**
 * Mon suivi : ce que j'ai publié et les réponses reçues, ce à quoi j'ai répondu, les invitations
 * reçues. En tête, ce qui attend une décision. Les numéros n'apparaissent qu'une fois la réponse
 * retenue ou l'invitation acceptée.
 */
import { useAuth } from '@/app/context/auth-context'
import { MarketNav } from '@/components/market/market-nav'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type Activity,
  type MarketPerson,
  type MyAnnouncement,
  type ReceivedResponse,
  type ResponseStatus,
  type SentResponse,
  activity,
  closeAnnouncement,
  decide,
  isError,
  markSeen,
  withdraw,
} from '@/lib/market/client'
import {
  TYPE_LABEL,
  formatPhone,
  formatQuantity,
  formatWorkDates,
  whatsappLink,
} from '@/lib/market/work'
import { Check, Lock, MessageCircle, Phone, Star, X } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

const KIND_LABEL: Record<MarketPerson['kind'], string> = {
  ouvrier: 'Ouvrier',
  acheteur: 'Acheteur',
  agronome: 'Agronome',
  membre: 'Membre',
}

const STATUS_PILL: Record<ResponseStatus, { label: string; tone: string }> = {
  envoyee: {
    label: 'À décider',
    tone: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  },
  invitee: {
    label: 'Invitation en attente',
    tone: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100',
  },
  retenue: { label: 'Retenu', tone: 'bg-primary/15 text-primary' },
  declinee: { label: 'Déclinée', tone: 'bg-muted text-muted-foreground' },
  retiree: { label: 'Retirée', tone: 'bg-muted text-muted-foreground' },
}

function Pill({ status, label }: { status: ResponseStatus; label?: string }) {
  const pill = STATUS_PILL[status]
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill.tone}`}
    >
      {label ?? pill.label}
    </span>
  )
}

function NewDot({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-destructive" />
      Nouveau
    </span>
  )
}

function PhoneActions({ phone, text }: { phone: string; text: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button asChild variant="outline" className="hover:bg-muted hover:text-foreground h-11 gap-2">
        <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
          <Phone aria-hidden="true" className="h-4 w-4" />
          <span className="tabular-nums">{formatPhone(phone)}</span>
        </a>
      </Button>
      <Button asChild variant="outline" className="hover:bg-muted hover:text-foreground h-11 gap-2">
        <a href={whatsappLink(phone, text)} target="_blank" rel="noopener noreferrer">
          <MessageCircle aria-hidden="true" className="h-4 w-4" /> WhatsApp
        </a>
      </Button>
    </div>
  )
}

function PersonLine({ person }: { person: MarketPerson }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold">
        {person.name}{' '}
        <span className="text-sm font-normal text-muted-foreground">
          · {KIND_LABEL[person.kind]}
        </span>
      </p>
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        {person.note !== null && (
          <span className="inline-flex items-center gap-1">
            <Star aria-hidden="true" className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            <span className="tabular-nums">{person.note.toLocaleString('fr-FR')}</span> (
            {person.reviews})
          </span>
        )}
        {person.skills.length > 0 && <span className="capitalize">{person.skills.join(', ')}</span>}
        {person.place && <span>{person.place}</span>}
      </p>
    </div>
  )
}

/** Décision à deux boutons, avec un état d'attente et l'erreur sous les boutons. */
function DecisionButtons({
  acceptLabel,
  onDecide,
}: {
  acceptLabel: string
  onDecide: (accept: boolean) => Promise<string | null>
}) {
  const [busy, setBusy] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = async (accept: boolean) => {
    setBusy(accept)
    setError(null)
    const failure = await onDecide(accept)
    setBusy(null)
    if (failure) setError(failure)
  }
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-2">
        <Button className="h-11 gap-2" disabled={busy !== null} onClick={() => void run(true)}>
          <Check aria-hidden="true" className="h-4 w-4" />
          {busy === true ? '…' : acceptLabel}
        </Button>
        <Button
          variant="outline"
          className="hover:bg-muted hover:text-foreground h-11 gap-2"
          disabled={busy !== null}
          onClick={() => void run(false)}
        >
          <X aria-hidden="true" className="h-4 w-4" />
          {busy === false ? '…' : 'Décliner'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function SmallAction({
  label,
  onRun,
}: {
  label: string
  onRun: () => Promise<string | null>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={busy}
        className="min-h-11 text-left text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
        onClick={async () => {
          setBusy(true)
          setError(null)
          const failure = await onRun()
          setBusy(false)
          if (failure) setError(failure)
        }}
      >
        {busy ? 'Un instant…' : label}
      </button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  )
}

function summary(a: MyAnnouncement | SentResponse['announcement']): string {
  return [
    a.type === 'job' && a.wage_per_day_fcfa
      ? `${a.wage_per_day_fcfa.toLocaleString('fr-FR')} FCFA/jour`
      : a.price_per_kg_fcfa
        ? `${a.price_per_kg_fcfa.toLocaleString('fr-FR')} FCFA/kg`
        : null,
    a.type === 'job' ? formatWorkDates(a.starts_on, a.work_days) : null,
    a.type !== 'job' && a.quantity_kg ? formatQuantity(a.quantity_kg) : null,
    a.place,
  ]
    .filter(Boolean)
    .join(' · ')
}

function ReceivedRow({
  announcement,
  response,
  act,
}: {
  announcement: MyAnnouncement
  response: ReceivedResponse
  act: (run: () => Promise<unknown>) => Promise<string | null>
}) {
  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <PersonLine person={response.person} />
        <div className="flex flex-col items-end gap-1">
          <Pill
            status={response.status}
            label={
              response.status === 'retenue' && response.origin === 'invitation'
                ? 'A accepté'
                : undefined
            }
          />
          <NewDot show={response.unseen && response.status !== 'envoyee'} />
        </div>
      </div>
      {(response.message || response.quantity_kg) && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
          {response.quantity_kg ? (
            <strong className="mr-1 tabular-nums">{formatQuantity(response.quantity_kg)}.</strong>
          ) : null}
          {response.message}
        </p>
      )}
      {response.status === 'envoyee' && announcement.open && (
        <DecisionButtons
          acceptLabel="Retenir"
          onDecide={(accept) => act(() => decide(response.id, accept))}
        />
      )}
      {response.status === 'retenue' && response.phone && (
        <PhoneActions
          phone={response.phone}
          text={`Bonjour ${response.person.name.split(' ')[0]}, c’est pour « ${announcement.title} » (FaîtiereHub).`}
        />
      )}
      {response.status === 'invitee' && (
        <SmallAction label="Retirer l’invitation" onRun={() => act(() => withdraw(response.id))} />
      )}
    </li>
  )
}

function MyAnnouncementCard({
  announcement,
  act,
}: {
  announcement: MyAnnouncement
  act: (run: () => Promise<unknown>) => Promise<string | null>
}) {
  const [confirmClose, setConfirmClose] = useState(false)
  const state = announcement.open
    ? 'Ouverte'
    : announcement.status === 'closed'
      ? 'Close'
      : 'Expirée'
  const pending = announcement.responses.filter((r) => r.status === 'envoyee').length

  return (
    <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">
            {TYPE_LABEL[announcement.type]} · {state}
          </p>
          <h3 className="mt-0.5 font-bold leading-snug">{announcement.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{summary(announcement)}</p>
        </div>
        {announcement.type === 'job' && announcement.positions ? (
          <p className="shrink-0 text-right">
            <span className="block text-2xl font-extrabold tabular-nums">
              {announcement.hired}/{announcement.positions}
            </span>
            <span className="text-xs text-muted-foreground">retenus</span>
          </p>
        ) : null}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        {announcement.responses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Pas encore de réponse.
            {announcement.type === 'job' && announcement.open
              ? ' Invitez les ouvriers disponibles près de votre champ.'
              : ' Elle apparaît sur le marché, du plus proche au plus loin.'}
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm font-semibold">
              {announcement.responses.length} réponse{announcement.responses.length > 1 ? 's' : ''}
              {pending > 0 ? ` · ${pending} à décider` : ''}
            </p>
            <ul className="divide-y divide-border">
              {announcement.responses.map((r) => (
                <ReceivedRow key={r.id} announcement={announcement} response={r} act={act} />
              ))}
            </ul>
          </>
        )}
      </div>

      {announcement.open && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
          {announcement.type === 'job' && (
            <Button asChild size="sm" className="h-10 bg-amber-700 text-white hover:bg-amber-800">
              <Link href="/travail?vue=ouvriers">Inviter des ouvriers</Link>
            </Button>
          )}
          {confirmClose ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              Clore l’annonce ? Elle quitte le marché.
              <SmallAction
                label="Oui, clore"
                onRun={() => act(() => closeAnnouncement(announcement.id))}
              />
              <button
                type="button"
                className="min-h-11 text-sm font-medium"
                onClick={() => setConfirmClose(false)}
              >
                Non
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="min-h-11 text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => setConfirmClose(true)}
            >
              Clore l’annonce (complet, vendu…)
            </button>
          )}
        </div>
      )}
    </article>
  )
}

function SentCard({
  response,
  act,
}: {
  response: SentResponse
  act: (run: () => Promise<unknown>) => Promise<string | null>
}) {
  const a = response.announcement
  const invited = response.origin === 'invitation'
  return (
    <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">
            {invited ? 'Invitation de' : 'Annonce de'} {response.author?.name ?? 'un utilisateur'}
            {!a.open ? ' · close' : ''}
          </p>
          <h3 className="mt-0.5 font-bold leading-snug">{a.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{summary(a)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Pill
            status={response.status}
            label={
              response.status === 'envoyee'
                ? 'En attente'
                : response.status === 'invitee'
                  ? 'À accepter'
                  : response.status === 'retenue'
                    ? invited
                      ? 'Acceptée'
                      : 'Vous êtes retenu'
                    : undefined
            }
          />
          <NewDot show={response.unseen && response.status !== 'invitee'} />
        </div>
      </div>
      {response.message && (
        <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">{response.message}</p>
      )}
      <div className="mt-3 space-y-2">
        {response.status === 'invitee' && a.open && (
          <DecisionButtons
            acceptLabel="Accepter"
            onDecide={(accept) => act(() => decide(response.id, accept))}
          />
        )}
        {response.status === 'retenue' && response.phone && (
          <PhoneActions
            phone={response.phone}
            text={`Bonjour, c’est pour « ${a.title} » (FaîtiereHub).`}
          />
        )}
        {response.status === 'retenue' && !response.phone && (
          <p className="text-sm text-muted-foreground">
            L’auteur n’a pas laissé de numéro : il vous appellera.
          </p>
        )}
        {(response.status === 'envoyee' || (response.status === 'retenue' && !invited)) && (
          <SmallAction label="Retirer ma réponse" onRun={() => act(() => withdraw(response.id))} />
        )}
      </div>
    </article>
  )
}

export default function SuiviContent() {
  const { user, isLoading } = useAuth()
  const [data, setData] = useState<Activity | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const seen = useRef(false)

  const load = useCallback(async () => {
    const result = await activity()
    if (isError(result)) {
      setState('error')
      return
    }
    setData(result)
    setState('ready')
    // Les nouvelles sont marquées lues une fois affichées (les décisions restent comptées).
    if (!seen.current) {
      seen.current = true
      void markSeen()
    }
  }, [])

  useEffect(() => {
    if (user) void load()
  }, [user, load])

  /** Lance une action puis recharge le suivi ; rend le message d'erreur s'il y en a un. */
  const act = useCallback(
    async (run: () => Promise<unknown>) => {
      const result = await run()
      if (isError(result)) return result.error
      await load()
      return null
    },
    [load],
  )

  const pendingCount = data
    ? data.announcements.reduce(
        (n, a) => n + (a.open ? a.responses.filter((r) => r.status === 'envoyee').length : 0),
        0,
      ) + data.sent.filter((r) => r.status === 'invitee' && r.announcement.open).length
    : undefined

  return (
    <>
      <MarketNav unread={user ? (pendingCount ?? undefined) : 0} />
      <section className="py-8 sm:py-12">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Mon suivi</h1>
          <p className="mt-2 text-muted-foreground">
            Vos annonces et leurs réponses, vos réponses et les invitations reçues.
          </p>

          {isLoading ? (
            <Skeleton className="mt-8 h-64 rounded-2xl" />
          ) : !user ? (
            <div className="mt-8 rounded-2xl border border-border p-6 text-center sm:p-8">
              <Lock aria-hidden="true" className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-lg font-semibold">Connectez-vous pour voir votre suivi</p>
              <div className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-2">
                <Button
                  asChild
                  variant="outline"
                  className="hover:bg-muted hover:text-foreground h-11"
                >
                  <Link href="/auth/login?redirect=%2Fmarche%2Fsuivi">Se connecter</Link>
                </Button>
                <Button asChild className="h-11">
                  <Link href="/auth/signup/haroo">Créer un compte</Link>
                </Button>
              </div>
            </div>
          ) : state === 'loading' ? (
            <div className="mt-8 space-y-4">
              <Skeleton className="h-40 rounded-2xl" />
              <Skeleton className="h-40 rounded-2xl" />
            </div>
          ) : state === 'error' || !data ? (
            <div className="mt-8 rounded-2xl border border-border p-6 text-center">
              <p className="font-semibold">Le suivi n’a pas pu être chargé.</p>
              <Button
                className="hover:bg-muted hover:text-foreground mt-4 h-11"
                variant="outline"
                onClick={() => void load()}
              >
                Réessayer
              </Button>
            </div>
          ) : data.announcements.length === 0 && data.sent.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
              <p className="text-lg font-semibold">Rien à suivre pour l’instant</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Publiez une annonce, ou répondez à une annonce du marché ou à une offre de travail.
                Tout ce qui s’ensuit s’affiche ici.
              </p>
              <div className="mx-auto mt-5 grid max-w-md gap-2 sm:grid-cols-3">
                <Button asChild className="h-11">
                  <Link href="/marche/publier">Publier</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="hover:bg-muted hover:text-foreground h-11"
                >
                  <Link href="/marche">Le marché</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="hover:bg-muted hover:text-foreground h-11"
                >
                  <Link href="/travail">Le travail</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-8 space-y-10">
              {data.sent.some((r) => r.status === 'invitee' && r.announcement.open) && (
                <section aria-labelledby="invitations">
                  <h2 id="invitations" className="mb-3 text-lg font-bold">
                    Invitations à accepter
                  </h2>
                  <div className="space-y-3">
                    {data.sent
                      .filter((r) => r.status === 'invitee' && r.announcement.open)
                      .map((r) => (
                        <SentCard key={r.id} response={r} act={act} />
                      ))}
                  </div>
                </section>
              )}

              {data.announcements.length > 0 && (
                <section aria-labelledby="mes-annonces">
                  <h2 id="mes-annonces" className="mb-3 text-lg font-bold">
                    Mes annonces
                  </h2>
                  <div className="space-y-3">
                    {data.announcements.map((a) => (
                      <MyAnnouncementCard key={a.id} announcement={a} act={act} />
                    ))}
                  </div>
                </section>
              )}

              {data.sent.some((r) => !(r.status === 'invitee' && r.announcement.open)) && (
                <section aria-labelledby="mes-reponses">
                  <h2 id="mes-reponses" className="mb-3 text-lg font-bold">
                    Mes réponses
                  </h2>
                  <div className="space-y-3">
                    {data.sent
                      .filter((r) => !(r.status === 'invitee' && r.announcement.open))
                      .map((r) => (
                        <SentCard key={r.id} response={r} act={act} />
                      ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
