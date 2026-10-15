'use client'

import { Loader2, Lock, MessageSquare } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

interface Props {
  cardNumber: string
  /** Appelé quand le code est accepté : la page rouvre l'espace privé. */
  onConnected: () => void
}

type Step = 'idle' | 'sending' | 'code' | 'verifying'
type Notice = { kind: 'error' | 'info'; text: string }

const CODE_LENGTH = 6

/**
 * Connexion par carte : le titulaire reçoit un code par SMS sur le téléphone
 * enregistré pour sa carte, sans créer de compte.
 *
 * Le numéro de carte est déjà dans l'adresse de la page : la seule chose à
 * taper est le code à six chiffres. Rien du numéro de téléphone n'est affiché —
 * le numéro de carte se lit sur la page publique, donc celui qui est devant cet
 * écran n'est pas forcément le titulaire et ne doit rien apprendre sur lui.
 *
 * Écrit pour un téléphone d'entrée de gamme et un utilisateur pressé : un seul
 * bouton à l'état initial, un champ numérique qui valide tout seul au sixième
 * chiffre, des messages en phrases courtes.
 */
export function CardLoginPanel({ cardNumber, onConnected }: Props) {
  const [step, setStep] = useState<Step>('idle')
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [cooldown, setCooldown] = useState(0)
  // Quel écran porte l'opération en cours : le PIN (écran initial) ou le code SMS.
  const [mode, setMode] = useState<'pin' | 'sms'>('pin')
  const inputRef = useRef<HTMLInputElement>(null)
  // Empêche deux validations simultanées (double toucher) sans dépendre du
  // rendu : un état React ne se met pas à jour assez vite pour ça.
  const submitting = useRef(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  useEffect(() => {
    if (step === 'code') inputRef.current?.focus()
  }, [step])

  const requestCode = async (from: 'idle' | 'code') => {
    if (cooldown > 0 && from === 'code') return
    setMode(from === 'idle' ? 'pin' : 'sms')
    setStep('sending')
    setNotice(null)
    try {
      const res = await fetch('/api/auth/card/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_number: cardNumber }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        resend_after?: number
        retry_after?: number
      }
      if (res.ok) {
        setCode('')
        setCooldown(data.resend_after ?? 60)
        setNotice({ kind: 'info', text: 'Code envoyé par SMS. Il arrive en quelques secondes.' })
        setMode('sms')
        setStep('code')
        return
      }
      if (res.status === 429 && data.retry_after) setCooldown(Math.min(data.retry_after, 3600))
      setNotice({ kind: 'error', text: data.error ?? "L'envoi a échoué. Réessayez." })
      setStep(from)
    } catch {
      setNotice({ kind: 'error', text: 'Pas de réseau. Réessayez quand il revient.' })
      setStep(from)
    }
  }

  const submit = async (value: string, kind: 'sms' | 'pin' = 'sms') => {
    if (submitting.current || !new RegExp(`^\\d{${CODE_LENGTH}}$`).test(value)) return
    submitting.current = true
    setStep('verifying')
    setNotice(null)
    setMode(kind)
    const back = kind === 'pin' ? 'idle' : 'code'
    try {
      const res = await fetch(kind === 'pin' ? '/api/auth/card/pin' : '/api/auth/card/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          kind === 'pin'
            ? { card_number: cardNumber, pin: value }
            : { card_number: cardNumber, code: value },
        ),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        code?: string
        attempts_left?: number
      }
      if (res.ok) {
        onConnected()
        return
      }
      setCode('')
      setStep(back)
      if (data.code === 'wrong_pin') {
        setNotice({
          kind: 'error',
          text:
            data.attempts_left && data.attempts_left > 0
              ? `PIN incorrect. Il vous reste ${data.attempts_left} essai${data.attempts_left > 1 ? 's' : ''}.`
              : 'PIN incorrect. Trop d’essais : la carte est fermée un moment.',
        })
      } else if (data.code === 'wrong_code' && typeof data.attempts_left === 'number') {
        setNotice({
          kind: 'error',
          text:
            data.attempts_left > 0
              ? `Code incorrect. Il vous reste ${data.attempts_left} essai${data.attempts_left > 1 ? 's' : ''}.`
              : 'Code incorrect. Plus d’essai pour ce code : demandez-en un nouveau.',
        })
      } else {
        setNotice({ kind: 'error', text: data.error ?? 'Ce code n’a pas fonctionné.' })
      }
    } catch {
      setCode('')
      setStep(back)
      setNotice({ kind: 'error', text: 'Pas de réseau. Réessayez quand il revient.' })
    } finally {
      submitting.current = false
    }
  }

  const loginHref = `/auth/login?redirect=${encodeURIComponent(`/verify/${cardNumber}`)}`

  // ── État initial : le PIN remis avec la carte ────────────────────────────
  if (step === 'idle' || (mode === 'pin' && (step === 'sending' || step === 'verifying'))) {
    const busy = step !== 'idle'
    return (
      <div id="card-login" className="vfp-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-full bg-white/[0.06] grid place-items-center">
            <Lock className="h-[18px] w-[18px] text-white/45" />
          </div>
          <div className="min-w-0">
            <p className="text-white text-[13.5px] font-semibold leading-tight">Informations privées</p>
            <p className="text-white/45 text-[12px] leading-snug">
              Entrez le PIN remis avec votre carte.
            </p>
          </div>
        </div>
        <label htmlFor="card-login-pin" className="sr-only">
          PIN de la carte
        </label>
        <input
          id="card-login-pin"
          value={code}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)
            setCode(digits)
            if (digits.length === CODE_LENGTH) void submit(digits, 'pin')
          }}
          type="password"
          autoComplete="off"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={CODE_LENGTH}
          placeholder="••••••"
          disabled={busy}
          className="w-full rounded-xl bg-white/[0.05] border border-white/[0.12] px-4 py-3.5 text-center text-[26px] font-bold tracking-[0.5em] text-white placeholder:text-white/15 focus:outline-none focus:border-[var(--vfp-accent)]/50 disabled:opacity-60"
        />
        <div aria-live="polite" className="min-h-[1.25rem]">
          {busy ? (
            <p className="text-[12.5px] text-white/55 inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Vérification…
            </p>
          ) : notice ? (
            <p role="alert" className="text-[12.5px] leading-snug text-red-300 bg-red-500/10 rounded-xl px-3 py-2">
              {notice.text}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setCode('')
              void requestCode('idle')
            }}
            disabled={busy}
            className="min-h-[44px] -ml-2 px-2 text-[12.5px] font-semibold text-[var(--vfp-accent)] disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            PIN perdu ? Code par SMS
          </button>
          <Link href={loginHref} className="min-h-[44px] inline-flex items-center px-2 text-[12.5px] text-white/50 underline underline-offset-2">
            J’ai un compte
          </Link>
        </div>
      </div>
    )
  }

  // ── Saisie du code ───────────────────────────────────────────────────────
  return (
    <div id="card-login" className="vfp-card rounded-2xl p-4 space-y-3.5">
      <div>
        <p className="text-white text-[14.5px] font-bold leading-tight">Entrez le code reçu par SMS</p>
        <p className="text-white/45 text-[12.5px] leading-snug mt-1">
          6 chiffres. Il est valable 10 minutes.
        </p>
      </div>

      <div>
        <label htmlFor="card-login-code" className="sr-only">
          Code reçu par SMS
        </label>
        <input
          ref={inputRef}
          id="card-login-code"
          value={code}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)
            setCode(digits)
            if (digits.length === CODE_LENGTH) void submit(digits)
          }}
          // Permet au téléphone de proposer lui-même le code reçu par SMS.
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={CODE_LENGTH}
          placeholder="••••••"
          disabled={step === 'verifying'}
          className="w-full rounded-xl bg-white/[0.05] border border-white/[0.12] px-4 py-3.5 text-center text-[26px] font-bold tracking-[0.5em] text-white placeholder:text-white/15 focus:outline-none focus:border-[var(--vfp-accent)]/50 disabled:opacity-60"
        />
      </div>

      <div aria-live="polite" className="min-h-[1.25rem]">
        {step === 'verifying' ? (
          <p className="text-[12.5px] text-white/55 inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Vérification…
          </p>
        ) : notice ? (
          <p
            role={notice.kind === 'error' ? 'alert' : undefined}
            className={`text-[12.5px] leading-snug rounded-xl px-3 py-2 ${notice.kind === 'error' ? 'text-red-300 bg-red-500/10' : 'text-[var(--vfp-accent)] bg-[var(--vfp-accent)]/10'}`}
          >
            {notice.text}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => requestCode('code')}
          disabled={cooldown > 0 || step === 'sending' || step === 'verifying'}
          className="min-h-[44px] -ml-2 px-2 text-[13px] font-semibold text-[var(--vfp-accent)] disabled:text-white/30"
        >
          {step === 'sending'
            ? 'Envoi…'
            : cooldown > 0
              ? `Renvoyer le code (${cooldown} s)`
              : 'Renvoyer le code'}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep('idle')
            setCode('')
            setNotice(null)
          }}
          className="min-h-[44px] px-2 text-[13px] text-white/45"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
