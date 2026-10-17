'use client'

/**
 * Arriving in HarooLife as a visitor, step by step: who you are (name and a unique username),
 * your look, two personality traits, the birth lottery and your first home in Lomé. Nothing is
 * created before « Emménager »: then the visitor account is made, the username taken and the new
 * game written (see game-entry.tsx). The rules and the amounts are in lib/haroolife/city/arrival.ts
 * and lib/haroolife/traits.ts; every franc is game money.
 */
import {
  ORIGINS,
  type OriginId,
  REDRAWS,
  START_HOMES,
  type StartHome,
  drawOrigin,
  homeRent,
  startMoney,
} from '@/lib/haroolife/city/arrival'
import { AVATAR_MODELS, type Avatar, DEFAULT_AVATAR, pagneColor } from '@/lib/haroolife/city/avatar'
import { MAX_TRAITS, TRAITS, TRAIT_IDS, type TraitId } from '@/lib/haroolife/traits'
import { normalizeUsername, usernameProblem } from '@/lib/haroolife/username'
import { ArrowLeft, Dices, Shuffle } from 'lucide-react'
import dynamic from 'next/dynamic'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import GraphicsBoundary from './graphics-boundary'
import { PAGNES } from './pagnes'

const AvatarPreview = dynamic(() => import('./avatar-preview'), { ssr: false })

export interface ArrivalChoice {
  name: string
  username: string
  avatar: Avatar
  traits: TraitId[]
  origin: OriginId
  home: StartHome
}

const STEPS = ['Toi', 'Apparence', 'Personnalité', 'Loterie de naissance', 'Logement'] as const
const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]

type Check = { state: 'idle' | 'checking' } | { state: 'free' | 'taken' | 'error'; message: string }

export default function Arrival({
  onBack,
  onFinish,
  busy,
  error,
  captcha,
  captchaReady = true,
  only,
}: {
  onBack: () => void
  onFinish: (choice: ArrivalChoice) => void
  busy: boolean
  /** What went wrong at « Emménager » (a username taken meanwhile brings back the first step). */
  error: { message: string; step?: number } | null
  /** The anti-robot check, shown on the last step (nothing when it is off). */
  captcha?: ReactNode
  captchaReady?: boolean
  /** A visitor who already plays only picks their username. */
  only?: 'identity'
}) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [check, setCheck] = useState<Check>({ state: 'idle' })
  const [avatar, setAvatar] = useState<Avatar>(DEFAULT_AVATAR)
  const [traits, setTraits] = useState<TraitId[]>([])
  const [origin, setOrigin] = useState<OriginId | null>(null)
  const [redraws, setRedraws] = useState(REDRAWS)
  const [rolling, setRolling] = useState(false)
  const [home, setHome] = useState<string | null>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const handle = normalizeUsername(username)
  const local = username ? usernameProblem(username) : null

  // A failure at the end that concerns the name brings the player back to it.
  useEffect(() => {
    if (error?.step !== undefined) setStep(error.step)
  }, [error])
  // Availability, checked a moment after typing stops.
  useEffect(() => {
    if (!username || local) {
      setCheck({ state: 'idle' })
      return
    }
    setCheck({ state: 'checking' })
    const ctrl = new AbortController()
    const id = window.setTimeout(() => {
      fetch(`/api/haroolife/username?u=${encodeURIComponent(handle)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: { available?: boolean; message?: string | null; error?: string }) =>
          setCheck(
            d.available
              ? { state: 'free', message: `@${handle} est libre.` }
              : d.error
                ? { state: 'error', message: d.error }
                : { state: 'taken', message: d.message ?? 'Ce nom n’est pas possible.' },
          ),
        )
        .catch((e: Error) => {
          if (e.name !== 'AbortError')
            setCheck({ state: 'error', message: 'Vérification impossible. Réessaie.' })
        })
    }, 400)
    return () => {
      ctrl.abort()
      window.clearTimeout(id)
    }
  }, [username, handle, local])
  // Each step starts at the top of the sheet.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on step change only
  useEffect(() => {
    sheet.current?.scrollTo({ top: 0 })
  }, [step])
  // The birth lottery is drawn when the player reaches it, with a short roll of the drum.
  const roll = () => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setOrigin(drawOrigin(Math.random()))
      return
    }
    setRolling(true)
    let n = 0
    const id = window.setInterval(() => {
      n++
      setOrigin(drawOrigin(Math.random()))
      if (n >= 9) {
        window.clearInterval(id)
        setRolling(false)
      }
    }, 110)
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: drawn once, on reaching the step
  useEffect(() => {
    if (step === 3 && origin === null) roll()
  }, [step])

  const chosenHome = home ? (START_HOMES.find((h) => h.id === home) ?? null) : null
  const affordable = (h: StartHome) => origin !== null && startMoney(origin, h) !== null
  // A home is suggested once the family is known: the balanced one if it fits, else the first.
  useEffect(() => {
    if (step !== 4 || !origin || (chosenHome && affordable(chosenHome))) return
    const fits = START_HOMES.filter(affordable)
    setHome(
      (fits.find((h) => h.id === 'tokoin-chambre-salon') ?? fits[fits.length - 1])?.id ?? null,
    )
  })

  const last = only ? 0 : STEPS.length - 1
  const ready = [
    !local && check.state === 'free' && (only !== undefined || name.trim().length >= 2),
    true,
    traits.length === MAX_TRAITS,
    origin !== null && !rolling,
    chosenHome !== null && affordable(chosenHome) && captchaReady,
  ][step]
  const next = () => {
    if (!ready || busy) return
    if (step < last) {
      setStep(step + 1)
      return
    }
    if (only) {
      onFinish({
        name: name.trim(),
        username: handle,
        avatar,
        traits,
        origin: 'fonctionnaire',
        home: START_HOMES.find((h) => h.quartier === 'tokoin') ?? START_HOMES[0],
      })
      return
    }
    if (origin && chosenHome)
      onFinish({ name: name.trim(), username: handle, avatar, traits, origin, home: chosenHome })
  }
  const shuffle = () => {
    if (step === 1)
      setAvatar({ v: 1, model: pick(AVATAR_MODELS).id, pagne: 1 + Math.floor(Math.random() * 8) })
    if (step === 2) setTraits([...TRAIT_IDS].sort(() => Math.random() - 0.5).slice(0, MAX_TRAITS))
    if (step === 4) {
      const fits = START_HOMES.filter(affordable)
      if (fits.length) setHome(pick(fits).id)
    }
  }
  const cta = [
    'Continuer',
    'Continuer',
    traits.length < MAX_TRAITS ? `Choisis encore ${MAX_TRAITS - traits.length}` : 'Continuer',
    'Choisir où habiter',
    busy ? 'On porte tes bagages…' : 'Emménager',
  ][step]
  const who = handle ? `@${handle}` : 'ton personnage'

  return (
    <main
      className="haroolife-screen fixed inset-0 z-[95] flex w-full flex-col bg-[#f3ebdd] text-[#13362b]"
      aria-label="Arriver dans HarooLife"
      data-testid="arrival"
      data-step={step}
    >
      <header className="relative z-10 flex items-center gap-2 px-4 pt-[max(14px,env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={() => (step === 0 ? onBack() : setStep(step - 1))}
          aria-label={step === 0 ? 'Revenir à l’accueil' : 'Étape précédente'}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white shadow-sm"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-lg font-black">{only ? 'Ton nom' : STEPS[step]}</h1>
          {!only && <p className="sr-only">{`Étape ${step + 1} sur ${STEPS.length}`}</p>}
          {!only && (
            <div className="mx-auto mt-1.5 flex max-w-[11rem] gap-1.5" aria-hidden="true">
              {STEPS.map((s, i) => (
                <span
                  key={s}
                  className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-[#157a52]' : 'bg-[#13362b]/15'}`}
                />
              ))}
            </div>
          )}
        </div>
        {[1, 2, 4].includes(step) ? (
          <button
            type="button"
            onClick={shuffle}
            aria-label="Au hasard"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white shadow-sm"
          >
            <Shuffle size={19} />
          </button>
        ) : (
          <span className="h-12 w-12 shrink-0" />
        )}
      </header>

      {/* The character, seen at every step, on a sandy pedestal. */}
      <div className="relative -mt-2 h-[34vh] min-h-[200px] shrink-0">
        <div
          aria-hidden="true"
          className="absolute inset-x-[18%] bottom-3 h-10 rounded-[50%] bg-[#13362b]/10"
        />
        <GraphicsBoundary onUnavailable={() => {}}>
          <AvatarPreview
            model={avatar.model}
            pagne={pagneColor(avatar.pagne)}
            className="relative h-full w-full"
          />
        </GraphicsBoundary>
        {handle && step > 0 && (
          <p className="absolute inset-x-0 bottom-1 text-center text-sm font-black">@{handle}</p>
        )}
      </div>

      <section
        ref={sheet}
        className="relative flex-1 overflow-y-auto rounded-t-[32px] bg-white px-5 pb-36 pt-6 shadow-[0_-8px_30px_rgba(19,54,43,0.08)]"
        aria-label={only ? 'Ton nom' : STEPS[step]}
      >
        {step === 0 && (
          <div className="space-y-5">
            <p className="text-[15px] leading-relaxed text-[#13362b]/80">
              Au quartier, on t’appelle comment ? Pas besoin d’e-mail ni de mot de passe : tu joues
              en visiteur.
            </p>
            <label className={only ? 'hidden' : 'block'}>
              <span className="text-sm font-bold">Ton nom</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 40))}
                autoComplete="given-name"
                placeholder="ex. Kodjo Agbéko"
                className="mt-1.5 block min-h-14 w-full rounded-2xl bg-[#f3efe6] px-4 text-base outline-none focus:ring-2 focus:ring-[#157a52]"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold">Nom d’utilisateur</span>
              <span className="mt-1.5 flex min-h-14 items-center rounded-2xl bg-[#f3efe6] px-4 focus-within:ring-2 focus-within:ring-[#157a52]">
                <span aria-hidden="true" className="text-lg font-bold text-[#13362b]/50">
                  @
                </span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s/g, '').slice(0, 21))}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="kodjo_lome"
                  aria-describedby="username-help"
                  className="w-full bg-transparent pl-1 text-base outline-none"
                />
              </span>
              <span id="username-help" className="mt-1.5 block text-sm" aria-live="polite">
                {local ? (
                  <span className="text-[#b4321f]">{local}</span>
                ) : check.state === 'checking' ? (
                  <span className="text-[#13362b]/60">On regarde si quelqu’un l’a déjà…</span>
                ) : check.state === 'free' ? (
                  <span className="font-semibold text-[#157a52]">✓ {check.message}</span>
                ) : check.state === 'taken' || check.state === 'error' ? (
                  <span className="text-[#b4321f]">{check.message}</span>
                ) : (
                  <span className="text-[#13362b]/60">
                    C’est le nom de ton personnage dans HarooLife, unique. Pas d’accent : le clavier
                    du cyber ne les aime pas 😅
                  </span>
                )}
              </span>
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <fieldset>
              <legend className="text-sm font-bold">Ton personnage</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {AVATAR_MODELS.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    aria-pressed={avatar.model === m.id}
                    onClick={() => setAvatar({ ...avatar, model: m.id })}
                    className={`rounded-2xl border-2 p-3 text-left ${avatar.model === m.id ? 'border-[#157a52] bg-[#e7f3ec]' : 'border-transparent bg-[#f3efe6]'}`}
                  >
                    <span className="block text-sm font-black">{m.label}</span>
                    <span className="block text-xs text-[#13362b]/60">{m.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-bold">Ton pagne</legend>
              <div className="mt-2 flex flex-wrap gap-2.5">
                {PAGNES.map((tone, i) => (
                  <button
                    key={tone}
                    type="button"
                    aria-label={`Pagne ${i + 1}`}
                    aria-pressed={avatar.pagne === i + 1}
                    onClick={() => setAvatar({ ...avatar, pagne: i + 1 })}
                    style={{
                      background: `repeating-linear-gradient(135deg, ${tone} 0 6px, ${tone}cc 6px 10px)`,
                    }}
                    className={`h-12 w-12 rounded-full ${avatar.pagne === i + 1 ? 'ring-4 ring-[#13362b] ring-offset-2' : 'ring-2 ring-white'}`}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-[15px]">
              Choisis {MAX_TRAITS} traits pour {who}.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {TRAIT_IDS.map((t) => {
                const on = traits.includes(t)
                return (
                  <button
                    type="button"
                    key={t}
                    aria-pressed={on}
                    onClick={() =>
                      setTraits((cur) =>
                        cur.includes(t)
                          ? cur.filter((x) => x !== t)
                          : cur.length < MAX_TRAITS
                            ? [...cur, t]
                            : [cur[1], t],
                      )
                    }
                    className={`rounded-3xl border-2 p-4 text-left ${on ? 'border-[#157a52] bg-[#e7f3ec]' : 'border-transparent bg-[#f3efe6]'}`}
                  >
                    <span aria-hidden="true" className="block text-3xl">
                      {TRAITS[t].icon}
                    </span>
                    <span className="mt-2 block text-base font-black leading-tight">
                      {TRAITS[t].name}
                    </span>
                    <span className="mt-1 block text-[13px] leading-snug text-[#13362b]/70">
                      {TRAITS[t].text}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 text-center">
            <p className="text-[15px] text-[#13362b]/80">
              Chaque Loméen naît quelque part. Et {who}, dans quelle famille ?
            </p>
            {origin && (
              <div
                aria-live="polite"
                data-testid="birth-lottery"
                data-origin={rolling ? '' : origin}
              >
                <div
                  className={`mx-auto grid h-36 w-36 place-items-center rounded-[36px] bg-gradient-to-br from-[#f7d77a] to-[#e9a825] text-7xl shadow-lg shadow-[#e9a825]/30 ${rolling ? 'scale-95 opacity-80' : 'scale-100'} transition-transform motion-reduce:transition-none`}
                  aria-hidden="true"
                >
                  {ORIGINS[origin].icon}
                </div>
                <h2 className="mt-5 text-3xl font-black tracking-tight">
                  {rolling ? '…' : `${ORIGINS[origin].name} !`}
                </h2>
                {!rolling && (
                  <>
                    <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-[#13362b]/75">
                      {ORIGINS[origin].text}
                    </p>
                    <p className="mx-auto mt-4 inline-block rounded-2xl bg-[#f3efe6] px-4 py-3 text-sm font-bold">
                      La famille te donne {money(ORIGINS[origin].wallet)}
                    </p>
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setRedraws((n) => n - 1)
                roll()
              }}
              disabled={redraws <= 0 || rolling}
              className="mx-auto flex min-h-12 items-center gap-2 rounded-full border-2 border-[#13362b]/15 px-5 text-sm font-bold disabled:opacity-40"
            >
              <Dices size={18} />
              {redraws > 0
                ? `Relancer le sort (encore ${redraws})`
                : 'La vie ne donne pas trois chances'}
            </button>
          </div>
        )}

        {step === 4 && origin && (
          <div className="space-y-3">
            <p className="text-[15px] text-[#13362b]/80">
              La famille paie la caution et l’avance. Toi, tu paies le mois d’agence.
            </p>
            {START_HOMES.map((h) => {
              const rent = homeRent(h)
              const left = startMoney(origin, h)
              const on = home === h.id
              return (
                <button
                  type="button"
                  key={h.id}
                  aria-pressed={on}
                  disabled={left === null}
                  onClick={() => setHome(h.id)}
                  className={`block w-full rounded-3xl border-2 p-4 text-left disabled:opacity-45 ${on ? 'border-[#157a52] bg-[#e7f3ec]' : 'border-transparent bg-[#f3efe6]'}`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-base font-black leading-tight">{h.title}</span>
                    <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold">
                      {h.tag}
                    </span>
                  </span>
                  <span className="mt-1.5 block text-[13px] leading-snug text-[#13362b]/70">
                    {h.text}
                  </span>
                  <span className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold">
                    <span className="text-[#157a52]">
                      {left === null
                        ? 'Trop cher pour ta famille'
                        : `Tu démarres avec ${money(left)}`}
                    </span>
                    <span>
                      Loyer {money(rent.amount)}/mois{rent.observed ? '' : ' (estimé)'}
                    </span>
                  </span>
                </button>
              )
            })}
            {captcha && <div className="pt-2">{captcha}</div>}
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-2xl bg-[#fbe9e5] p-3 text-sm font-semibold text-[#8f2414]"
          >
            {error.message}
          </p>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-white via-white to-white/0 px-5 pb-[max(18px,env(safe-area-inset-bottom,0px))] pt-6">
        <button
          type="button"
          onClick={next}
          disabled={!ready || busy}
          className="flex min-h-14 w-full items-center justify-center rounded-full bg-[#157a52] px-4 text-lg font-black text-white shadow-lg shadow-[#157a52]/25 disabled:bg-[#157a52]/40 disabled:shadow-none"
        >
          {only ? (busy ? 'Un instant…' : 'Valider mon nom') : cta}
        </button>
      </div>
    </main>
  )
}
