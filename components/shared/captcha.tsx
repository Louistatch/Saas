'use client'

/**
 * Anti-robot check (Cloudflare Turnstile) for the Supabase Auth calls made from the browser:
 * visitor entry, sign-in, password reset, confirmation e-mail sent again. Off until
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is set: no script, no widget, `ready` true and `token` null, so
 * the calls are exactly as before. Once the key is deployed, « Enable CAPTCHA protection » in Supabase (Turnstile secret) makes Supabase
 * refuse these calls without a valid token. Server calls made with the service key are not
 * concerned (Supabase skips the check for admin credentials).
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
// Turnstile tokens expire after five minutes. Renew a little earlier, including after a tab
// was suspended (the submit handler reads the timestamp rather than trusting a delayed timer).
const TOKEN_LIFETIME = 270_000

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

let loading: Promise<Turnstile> | null = null
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loading) return loading
  const task = new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement('script')
    const fail = () => {
      window.clearTimeout(timer)
      s.remove()
      reject(new Error('turnstile'))
    }
    const timer = window.setTimeout(fail, 15_000)
    s.src = SCRIPT
    s.async = true
    s.onload = () => {
      window.clearTimeout(timer)
      if (window.turnstile) resolve(window.turnstile)
      else fail()
    }
    s.onerror = fail
    document.head.appendChild(s)
  })
  loading = task
  void task.catch(() => {
    if (loading === task) loading = null
  })
  return task
}

export function useCaptcha(): {
  enabled: boolean
  /** The token to pass as `options.captchaToken` (null when off or not yet solved). */
  token: string | null
  /** Read immediately before Auth: rejects expired tokens even after a suspended tab. */
  getToken: () => string | null
  /** True only when CAPTCHA is off or a fresh check succeeded. Errors never bypass it. */
  ready: boolean
  /** Visible check and recovery button, mounted where the protected action is submitted. */
  box: ReactNode
  /** A token is single-use: call after each attempt. */
  reset: () => void
} {
  const [token, setToken] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const answer = useRef<{ value: string; at: number } | null>(null)
  // The box may appear long after the hook (the last step of the visitor arrival), and leave
  // again: the check lives exactly as long as its box is on the page.
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const widget = useRef<string | null>(null)
  const reset = useCallback(() => {
    if (!SITE_KEY) return
    answer.current = null
    setToken(null)
    setFailed(false)
    if (widget.current && window.turnstile) {
      try {
        window.turnstile.reset(widget.current)
        return
      } catch {
        // A missing or unusable widget is recreated; a failed script can be downloaded again.
      }
    }
    setAttempt((n) => n + 1)
  }, [])
  const getToken = useCallback(() => {
    const current = answer.current
    if (!current) return null
    if (Date.now() - current.at >= TOKEN_LIFETIME) {
      reset()
      return null
    }
    return current.value
  }, [reset])
  useEffect(() => {
    // Fetched ahead, so the check is quick once its box shows.
    if (SITE_KEY) void loadTurnstile().catch(() => {})
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt deliberately remounts a failed widget/script
  useEffect(() => {
    if (!SITE_KEY || !host) return
    let alive = true
    let id: string | null = null
    void loadTurnstile()
      .then((t) => {
        if (!alive) return
        id = t.render(host, {
          sitekey: SITE_KEY,
          appearance: 'always',
          size: 'flexible',
          language: 'fr',
          callback: (v: string) => {
            if (!alive) return
            answer.current = { value: v, at: Date.now() }
            setFailed(false)
            setToken(v)
          },
          'refresh-expired': 'manual',
          'expired-callback': () => {
            if (alive) reset()
          },
          'refresh-timeout': 'manual',
          'timeout-callback': () => {
            if (alive) reset()
          },
          'error-callback': () => {
            if (!alive) return
            answer.current = null
            setToken(null)
            setFailed(true)
          },
        })
        widget.current = id
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
      if (id) {
        try {
          window.turnstile?.remove(id)
        } catch {
          /* already gone with its box */
        }
      }
      if (widget.current === id) widget.current = null
      // A token from a check no longer on the page is never sent (it would expire unseen).
      answer.current = null
      setToken(null)
      setFailed(false)
    }
  }, [host, attempt, reset])
  useEffect(() => {
    if (!token) return
    const timer = window.setTimeout(reset, TOKEN_LIFETIME)
    return () => window.clearTimeout(timer)
  }, [token, reset])
  return {
    enabled: !!SITE_KEY,
    token,
    getToken,
    ready: !SITE_KEY || (!!token && !failed),
    box: SITE_KEY ? (
      <div data-testid="captcha-check" className="mb-3 space-y-2 text-center text-xs">
        <div ref={setHost} className="mx-auto w-full max-w-sm" />
        <output className={`block ${failed ? 'text-red-800' : 'text-emerald-900'}`}>
          {failed
            ? 'Le contrôle anti-robot n’a pas abouti. Vérifie ta connexion, puis relance-le.'
            : token
              ? 'Vérification anti-robot réussie.'
              : 'Vérification anti-robot en cours…'}
        </output>
        {failed && (
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-xl border border-emerald-800/25 bg-white px-4 font-semibold text-emerald-900"
          >
            Relancer la vérification
          </button>
        )}
      </div>
    ) : null,
    reset,
  }
}
