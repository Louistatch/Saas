'use client'

import { useAuth } from '@/app/context/auth-context'
import { useCaptcha } from '@/components/shared/captcha'
import { Logo } from '@/components/shared/logo'
import { useHarooLifeViewport } from '@/hooks/use-haroolife-viewport'
import { performGameLogout } from '@/lib/auth/logout'
import { LOCALITIES } from '@/lib/haroolife/city/locality'
import { CITY_STORAGE } from '@/lib/haroolife/city/migrate'
import { GAME_ENTERED, rememberGameReturn, withGameReturn } from '@/lib/haroolife/entry'
import { ArrowLeft, ArrowRight, Leaf, ShieldCheck, UserRound } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useState } from 'react'
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
  // « Jouer en visiteur »: one tap, then straight into the game once the account exists.
  const [visit, setVisit] = useState<'idle' | 'busy' | string>('idle')
  useEffect(() => {
    setReturnTo(window.location.pathname + window.location.search)
    setSummary(savedSummary())
    try {
      setEntered(sessionStorage.getItem(GAME_ENTERED))
    } catch {
      /* entry stays available */
    }
  }, [])
  const enter = () => {
    if (!user || !isAuthenticated || isLoading) return
    try {
      sessionStorage.setItem(GAME_ENTERED, user.id)
    } catch {
      /* current tab still works */
    }
    setEntered(user.id)
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: enters once the visitor's account is ready
  useEffect(() => {
    if (visit === 'busy' && user && isAuthenticated && !isLoading) {
      setVisit('idle')
      enter()
    }
  }, [visit, user, isAuthenticated, isLoading])
  // Anti-robot check before a visitor account is created (off until its key is configured).
  const captcha = useCaptcha()
  const playAsVisitor = async () => {
    setVisit('busy')
    const error = await startVisit(captcha.token)
    if (error) {
      setVisit(error)
      captcha.reset()
    }
  }
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
                disabled={visit === 'busy' || !captcha.ready}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 font-bold text-white shadow-md shadow-amber-800/15 hover:bg-amber-600 disabled:opacity-60"
              >
                {visit === 'busy' ? 'Entrée…' : 'Jouer en visiteur'}
                <ArrowRight size={19} />
              </button>
              {captcha.box && <div className="mt-2">{captcha.box}</div>}
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
