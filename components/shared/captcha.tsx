'use client'

/**
 * Anti-robot check (Cloudflare Turnstile) for the Supabase Auth calls made from the browser:
 * visitor entry, sign-in, password reset. Off until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set: no
 * script, no widget, `ready` true and `token` null, so the calls are exactly as before. Once the
 * key is deployed, « Enable CAPTCHA protection » in Supabase (Turnstile secret) makes Supabase
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
  const el = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  useEffect(() => {
    if (!SITE_KEY || !el.current) return
    let alive = true
    void loadTurnstile()
      .then((t) => {
        if (!alive || !el.current) return
        widget.current = t.render(el.current, {
          sitekey: SITE_KEY,
          appearance: 'interaction-only',
          language: 'fr',
          callback: (v: string) => setToken(v),
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
        })
      })
      .catch(() => {
        // Script blocked or offline: the button stays waiting; Supabase decides in the end.
      })
    return () => {
      alive = false
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [])
  const reset = useCallback(() => {
    if (!SITE_KEY) return
    setToken(null)
    if (widget.current) window.turnstile?.reset(widget.current)
  }, [])
  return {
    enabled: !!SITE_KEY,
    token,
    ready: !SITE_KEY || !!token,
    box: SITE_KEY ? <div ref={el} className="flex justify-center" /> : null,
    reset,
  }
}
