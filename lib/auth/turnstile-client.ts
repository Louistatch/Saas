/** The API stays on Cloudflare's official origin; never proxy or self-host this script. */
const ONLOAD = '__faitiereTurnstileLoaded'
export const TURNSTILE_SCRIPT = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${ONLOAD}`

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: Turnstile
    __faitiereTurnstileLoaded?: () => void
  }
}

function available(api: Turnstile | undefined): api is Turnstile {
  return (
    !!api &&
    typeof api.render === 'function' &&
    typeof api.reset === 'function' &&
    typeof api.remove === 'function'
  )
}

let loading: Promise<Turnstile> | null = null

export function loadTurnstile(): Promise<Turnstile> {
  if (available(window.turnstile)) return Promise.resolve(window.turnstile)
  if (loading) return loading
  const task = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script')
    let settled = false
    let bootstrapTimer: number | undefined
    const cleanup = () => {
      window.clearTimeout(timer)
      window.clearTimeout(bootstrapTimer)
      document.removeEventListener('securitypolicyviolation', policyViolation)
      script.onload = null
      script.onerror = null
      if (window.__faitiereTurnstileLoaded === ready) window.__faitiereTurnstileLoaded = undefined
    }
    const fail = (code: string) => {
      if (settled) return
      settled = true
      cleanup()
      script.remove()
      reject(new Error(code))
    }
    const ready = () => {
      if (settled) return
      if (!available(window.turnstile)) return fail('script-api')
      settled = true
      cleanup()
      resolve(window.turnstile)
    }
    const policyViolation = (event: SecurityPolicyViolationEvent) => {
      if (
        event.blockedURI.startsWith('https://challenges.cloudflare.com/') &&
        event.effectiveDirective.startsWith('script-src')
      )
        fail('script-csp')
    }
    const timer = window.setTimeout(() => fail('script-timeout'), 45_000)
    // Define the callback before the request. A script element's load event alone does not
    // establish that the provider exposed a usable API. Async rendering uses its own callback.
    window.__faitiereTurnstileLoaded = ready
    document.addEventListener('securitypolicyviolation', policyViolation)
    script.src = TURNSTILE_SCRIPT
    script.async = true
    script.crossOrigin = 'anonymous'
    script.referrerPolicy = 'strict-origin-when-cross-origin'
    script.onload = () => {
      if (!settled) bootstrapTimer = window.setTimeout(() => fail('script-api'), 5_000)
    }
    script.onerror = () => fail('script-load')
    document.head.appendChild(script)
  })
  loading = task
  void task.catch(() => {
    if (loading === task) loading = null
  })
  return task
}
