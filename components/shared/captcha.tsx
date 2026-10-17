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
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    s.onerror = () => {
      loading = null
      reject(new Error('turnstile'))
    }
    document.head.appendChild(s)
  })
  return loading
}

export function useCaptcha(): {
  enabled: boolean
  /** The token to pass as `options.captchaToken` (null when off or not yet solved). */
  token: string | null
  /** True when the call may go: captcha off, or solved. */
  ready: boolean
  /** Where the check appears (usually invisible; shows a box only when it needs the person). */
  box: ReactNode
  /** A token is single-use: call after each attempt. */
  reset: () => void
} {
  const [token, setToken] = useState<string | null>(null)
  // The box may appear long after the hook (the last step of the visitor arrival), and leave
  // again: the check lives exactly as long as its box is on the page.
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const widget = useRef<string | null>(null)
  useEffect(() => {
    // Fetched ahead, so the check is quick once its box shows.
    if (SITE_KEY) void loadTurnstile().catch(() => {})
  }, [])
  useEffect(() => {
    if (!SITE_KEY || !host) return
    let alive = true
    let id: string | null = null
    void loadTurnstile()
      .then((t) => {
        if (!alive) return
        id = t.render(host, {
          sitekey: SITE_KEY,
          appearance: 'interaction-only',
          language: 'fr',
          callback: (v: string) => setToken(v),
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
        })
        widget.current = id
      })
      .catch(() => {
        // Script blocked or offline: the button stays waiting; Supabase decides in the end.
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
      setToken(null)
    }
  }, [host])
  const reset = useCallback(() => {
    if (!SITE_KEY) return
    setToken(null)
    if (widget.current) window.turnstile?.reset(widget.current)
  }, [])
  return {
    enabled: !!SITE_KEY,
    token,
    ready: !SITE_KEY || !!token,
    box: SITE_KEY ? <div ref={setHost} className="flex justify-center" /> : null,
    reset,
  }
}
