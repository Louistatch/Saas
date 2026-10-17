'use client'

import { useAuth } from '@/app/context/auth-context'
import { useCaptcha } from '@/components/shared/captcha'
import { Logo } from '@/components/shared/logo'
import { useHarooLifeViewport } from '@/hooks/use-haroolife-viewport'
import { performGameLogout } from '@/lib/auth/logout'
import { arrivalLife } from '@/lib/haroolife/city/arrival'
import { AVATAR_CHOSEN_STORAGE, saveAvatar } from '@/lib/haroolife/city/avatar'
import { LOCALITIES } from '@/lib/haroolife/city/locality'
import { CITY_STORAGE } from '@/lib/haroolife/city/migrate'
import { CLOUD_META, type CloudMeta } from '@/lib/haroolife/cloud-save'
import { GAME_ENTERED, rememberGameReturn, withGameReturn } from '@/lib/haroolife/entry'
import { INVITE_STORAGE, inviteCodeFrom } from '@/lib/haroolife/invite'
import { ArrowLeft, ArrowRight, Leaf, ShieldCheck, UserRound } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import Arrival, { type ArrivalChoice } from './arrival'
import { AccountPrompt, startVisit } from './visitor'

// The world and Three.js are loaded only after a real FaîtiereHub profile and entry consent.
const World = dynamic(() => import('./lome-life-immersive').then((m) => m.LomeLifeImmersive), {
  ssr: false,
  loading: () => (
    <div className="haroolife-screen fixed inset-0 grid w-full place-items-center bg-[#98b7a8] text-emerald-950">
      <output>Préparation de HarooLife…</output>
    </div>
  ),
})

type Summary = { day: number; wallet: number; town: string }
type ArrivalError = { message: string; step?: number }

/** Takes the username (and, for a newcomer, the home's canton); null when it worked. */
async function claimUsername(c: ArrivalChoice): Promise<ArrivalError | null> {
  const res = await fetch('/api/haroolife/username', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: c.username,
      quartier: c.home.quartier,
      pagne: c.avatar.pagne,
      adult: c.adult,
    }),
  }).catch(() => null)
  if (res?.ok) return null
  const data: { error?: string } = res ? await res.json().catch(() => ({})) : {}
  return {
    message: data.error ?? 'Connexion interrompue. Réessaie.',
    step: res?.status === 409 || res?.status === 400 ? 0 : undefined,
  }
}

/**
 * The newcomer's game on this device: look, traits, family and home as chosen. A game already
 * on the device (another player's, not yet online) is kept aside, never erased.
 */
function writeArrival(c: ArrivalChoice, owner: string) {
  try {
    const before = localStorage.getItem(CITY_STORAGE)
    if (before) localStorage.setItem(`${CITY_STORAGE}.before-arrival`, before)
    localStorage.setItem(CITY_STORAGE, JSON.stringify(arrivalLife(c)))
    // This game is the newcomer's: the online save keeps it (never a fresh one instead).
    const meta: CloudMeta = { owner, version: 0, syncedAt: 0, localAt: Date.now(), visitor: true }
    localStorage.setItem(CLOUD_META, JSON.stringify(meta))
    saveAvatar(localStorage, c.avatar)
    localStorage.setItem(AVATAR_CHOSEN_STORAGE, '1')
  } catch {
    /* storage refused: the game starts with its default life */
  }
}
function savedSummary(): Summary | null {
  try {
    const saved = JSON.parse(localStorage.getItem(CITY_STORAGE) ?? 'null')
    if (
      !saved ||
      saved.v !== 1 ||
      !Number.isFinite(saved.life?.wallet) ||
      !Number.isFinite(saved.life?.day)
    )
      return null
    const locality = saved.locality as keyof typeof LOCALITIES
    return {
      day: saved.life.day,
      wallet: saved.life.wallet,
      town: LOCALITIES[locality]?.name ?? 'Lomé',
    }
  } catch {
    return null
  }
}

export default function GameEntry() {
  const { user: account, visitor: visiting, isLoading } = useAuth()
  // The player: a FaîtiereHub account, or else a HarooLife visitor (opens the game only).
  const user = account ?? visiting
  const isAuthenticated = !!user
  const visitor = !account && !!visiting
  const viewport = useHarooLifeViewport<HTMLElement>()
  const [entered, setEntered] = useState<string | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [returnTo, setReturnTo] = useState('/haroolife')
  const [leaving, setLeaving] = useState(false)
  // « Jouer en visiteur »: the arrival steps, then the account, the username and the game.
  const [visit, setVisit] = useState<'idle' | 'busy' | string>('idle')
  const [arriving, setArriving] = useState<null | 'new' | 'identity'>(null)
  const [arrivalError, setArrivalError] = useState<ArrivalError | null>(null)
  const pending = useRef<{ choice: ArrivalChoice; newGame: boolean } | null>(null)
  // A visitor's username (undefined until known; null: not chosen yet).
  const [myUsername, setMyUsername] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    // Refresh an older scanner worker that may still control this tab, without reloading it
    // or touching the player's local saves and arrival choices.
    void navigator.serviceWorker
      ?.getRegistration()
      .then((registration) => registration?.update())
      .catch(() => {})
    // Arrived by a friend's link: the code waits on this phone until the game can accept it.
    const invite = inviteCodeFrom(new URLSearchParams(window.location.search).get('invite'))
    if (invite)
      try {
        localStorage.setItem(INVITE_STORAGE, invite)
      } catch {
        /* storage refused: no bonus, the game still opens */
      }
    setReturnTo(window.location.pathname + window.location.search)
    setSummary(savedSummary())
    try {
      setEntered(sessionStorage.getItem(GAME_ENTERED))
    } catch {
      /* entry stays available */
    }
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: once the visitor is known
  useEffect(() => {
    if (!visitor || !user) return
    let live = true
    void fetch('/api/haroolife/username')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { username?: string | null } | null) => {
        if (live && d) setMyUsername(d.username ?? null)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [visitor, user?.id])
  const enter = () => {
    if (!user || !isAuthenticated || isLoading) return
    // Every visitor has a username: one who arrived before it existed picks it first.
    if (visitor && myUsername === null) {
      setArriving('identity')
      return
    }
    try {
      sessionStorage.setItem(GAME_ENTERED, user.id)
    } catch {
      /* current tab still works */
    }
    setEntered(user.id)
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once the visitor's account is ready
  useEffect(() => {
    if (visit !== 'busy' || !user || !isAuthenticated || isLoading) return
    const job = pending.current
    if (!job) {
      setVisit('idle')
      enter()
      return
    }
    pending.current = null
    void claimUsername(job.choice).then((problem) => {
      setVisit('idle')
      if (problem) {
        setArrivalError(problem)
        return
      }
      if (job.newGame) writeArrival(job.choice, user.id)
      setMyUsername(job.choice.username)
      setArriving(null)
      try {
        sessionStorage.setItem(GAME_ENTERED, user.id)
      } catch {
        /* current tab still works */
      }
      setEntered(user.id)
    })
  }, [visit, user, isAuthenticated, isLoading])
  // Anti-robot check before a visitor account is created (off until its key is configured). It
  // shows on the last step of the arrival, where the account is created, not on this screen.
  const captcha = useCaptcha()
  const playAsVisitor = () => {
    setArrivalError(null)
    setArriving('new')
  }
  // « Emménager »: the visitor account (once), then the username, the home and the new game.
  const finishArrival = async (choice: ArrivalChoice) => {
    if (pending.current) return
    const token = captcha.getToken()
    if (!user && captcha.enabled && !token) {
      setArrivalError({
        message: 'Termine la vérification anti-robot ci-dessous. Tes choix sont conservés.',
      })
      return
    }
    setArrivalError(null)
    pending.current = { choice, newGame: arriving === 'new' }
    setVisit('busy')
    if (user) return
    const error = await startVisit(token, choice.name)
    if (error) {
      pending.current = null
      setVisit('idle')
      setArrivalError({ message: error })
      captcha.reset()
    }
  }
  if (arriving)
    return (
      <Arrival
        only={arriving === 'identity' ? 'identity' : undefined}
        onBack={() => {
          setArriving(null)
          setArrivalError(null)
        }}
        onFinish={(c) => void finishArrival(c)}
        busy={visit === 'busy'}
        error={arrivalError}
        captcha={user ? undefined : captcha.box}
        captchaReady={!!user || captcha.ready}
      />
    )
  if (!isLoading && isAuthenticated && user && entered === user.id)
    return (
      <World
        key={user.id}
        onExit={() => {
          try {
            sessionStorage.removeItem(GAME_ENTERED)
          } catch {
            /* session-only mode */
          }
          setSummary(savedSummary())
          setEntered(null)
        }}
      />
    )
  return (
    <main
      ref={viewport}
      className="haroolife-screen fixed inset-0 z-[95] w-full overflow-y-auto bg-[#f6f7ef] text-[#173c31]"
      aria-label="Accueil HarooLife"
    >
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* A light welcome screen; no WebGL context or avatar is started before login. */}
        <div className="absolute inset-0 bg-[url('/images/dashboard/haroolife-territory.webp')] bg-cover bg-center opacity-65" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#eef6e9]/85 via-[#edf4e7]/30 to-[#f6f7ef]" />
      </div>
      <div className="relative mx-auto flex min-h-full max-w-6xl flex-col px-5 pb-[max(24px,env(safe-area-inset-bottom,0px))] pt-[max(20px,env(safe-area-inset-top,0px))] sm:px-10">
        <header className="flex items-center justify-between gap-3">
          <Logo size="sm" />
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-1 rounded-full bg-white/80 px-3 text-xs font-semibold"
          >
            <ArrowLeft size={14} /> FaîtiereHub
          </Link>
        </header>
        <section className="flex flex-1 flex-col items-center justify-center py-8 text-center sm:py-14">
          <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-white bg-white/75 shadow-sm">
            <Leaf size={29} className="text-emerald-700" />
          </span>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-800">
            Une expérience FaîtiereHub
          </p>
          <h1 className="mt-2 text-5xl font-black tracking-tight sm:text-7xl">
            Haroo<span className="text-emerald-700">Life</span>
          </h1>
          <p className="mt-3 max-w-md text-lg font-medium">Le Togo se vit ensemble.</p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-[#3e6351]">
            Explore ta ville, rencontre tes voisins et découvre les métiers du quotidien.
          </p>
        </section>
        <section
          className="mx-auto w-full max-w-md rounded-[28px] border border-white bg-white/95 p-5 shadow-xl shadow-emerald-950/10 sm:p-6"
          aria-label="Entrer dans HarooLife"
        >
          {isLoading ? (
            <output className="block py-6 text-center text-sm">
              Vérification de votre connexion FaîtiereHub…
            </output>
          ) : isAuthenticated && user ? (
            <>
              <div className="flex items-center gap-3 rounded-2xl bg-[#f0f5ed] p-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                  <UserRound size={24} />
                </span>
                <div>
                  <h2 className="font-bold">Bonjour, {user.firstName || 'cher joueur'}</h2>
                  <p className="mt-0.5 text-xs text-[#58725d]">
                    {visitor ? 'Tu joues en visiteur' : 'Connecté avec FaîtiereHub'}
                  </p>
                </div>
              </div>
              {summary && (
                <p className="mt-4 text-center text-sm" data-testid="saved-game-summary">
                  {summary.town} · Jour {summary.day} · {summary.wallet.toLocaleString('fr-FR')}{' '}
                  FCFA de jeu
                </p>
              )}
              <button
                type="button"
                onClick={enter}
                className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 font-bold text-white shadow-md shadow-emerald-800/15 hover:bg-emerald-800"
              >
                {summary ? 'Continuer ma partie' : 'Entrer dans HarooLife'}
                <ArrowRight size={19} />
              </button>
              <p className="mt-3 text-center text-xs text-[#687b68]">
                {summary
                  ? 'Ta progression reste enregistrée sur cet appareil.'
                  : 'Ton aventure et ton apparence commencent dans le jeu.'}
              </p>
              {visitor && (
                <div className="mt-4">
                  <AccountPrompt reason="Tu joues en visiteur. Pour ta coopérative et les fonctions FaîtiereHub, connecte-toi d’abord : ta partie te suit." />
                </div>
              )}
              <button
                type="button"
                hidden={visitor}
                disabled={leaving}
                onClick={() => {
                  setLeaving(true)
                  void performGameLogout(returnTo)
                }}
                className="mx-auto mt-3 block min-h-11 px-3 text-xs font-semibold text-emerald-800 underline disabled:opacity-50"
              >
                {leaving ? 'Déconnexion…' : 'Changer de compte'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void playAsVisitor()}
                disabled={visit === 'busy'}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 font-bold text-white shadow-md shadow-amber-800/15 hover:bg-amber-600 disabled:opacity-60"
              >
                {visit === 'busy' ? 'Entrée…' : 'Jouer en visiteur'}
                <ArrowRight size={19} />
              </button>
              <p className="mt-2 text-center text-xs text-[#687b68]">
                Sans compte, sans e-mail : tu joues à tout, avec les autres joueurs. Pour les
                fonctions FaîtiereHub (ta coopérative, tes parcelles), on te demandera de te
                connecter.
              </p>
              {visit !== 'idle' && visit !== 'busy' && (
                <p role="alert" className="mt-2 text-center text-xs font-semibold text-red-700">
                  {visit}
                </p>
              )}
              <div className="my-5 h-px bg-emerald-900/10" />
              <h2 className="text-xl font-bold">Votre compte, votre aventure</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#58725d]">
                Connectez-vous avec votre compte FaîtiereHub habituel. Il donne aussi accès à
                HarooLife.
              </p>
              <Link
                href={withGameReturn('/auth/login', returnTo)}
                onClick={() => rememberGameReturn(returnTo)}
                className="mt-5 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-3 py-3 text-sm font-bold text-white hover:bg-emerald-800"
              >
                Se connecter avec FaîtiereHub <ArrowRight size={18} />
              </Link>
              <Link
                href={withGameReturn('/auth/signup', returnTo)}
                onClick={() => rememberGameReturn(returnTo)}
                className="mt-3 flex min-h-12 items-center justify-center rounded-2xl border border-emerald-900/15 px-3 py-3 text-sm font-semibold"
              >
                Créer un compte FaîtiereHub
              </Link>
            </>
          )}
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-[#687b68]">
            <ShieldCheck size={14} /> Même compte · Même écosystème
          </p>
        </section>
        <p className="mx-auto mt-5 max-w-md text-center text-[11px] leading-relaxed text-[#58725d]">
          HarooLife est un jeu de simulation. Sa monnaie fictive est distincte de vos paiements et
          activités professionnels.
        </p>
      </div>
    </main>
  )
}
