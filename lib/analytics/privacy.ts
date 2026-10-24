export const ANALYTICS_CHOICE = 'fhub_analytics_v1'
export const ANALYTICS_EVENT = 'fhub:analytics-choice'
export type AnalyticsChoice = 'granted' | 'denied'
const MAX_AGE = 180 * 24 * 60 * 60 * 1000
const safeSegments = new Set([
  'dashboard',
  'admin',
  'members',
  'cards',
  'analytics',
  'settings',
  'integrations',
  'academy',
  'courses',
  'lessons',
  'marketplace',
  'market',
  'travail',
  'marche',
  'cooperative',
  'reports',
  'legal',
  'cookies',
  'privacy',
  'terms',
  'login',
  'register',
  'pricing',
  'contact',
  'about',
  'faq',
  'help',
  'haroolife',
  'formations',
  'catalogue',
  'auth',
  'callback',
  'reset-password',
  'verify',
  'map',
])

/** Only known route labels survive; queries, fragments and dynamic values never do. */
export function analyticsPath(input: string): string {
  try {
    const parts = new URL(input, 'https://faitierehub.invalid').pathname.split('/').filter(Boolean)
    if (!parts.length) return '/'
    if (!safeSegments.has(parts[0])) return '/autre'
    return `/${parts
      .slice(0, 3)
      .map((part) => (safeSegments.has(part) ? part : ':id'))
      .join('/')}`
  } catch {
    return '/autre'
  }
}
export function readAnalyticsChoice(
  storage: Pick<Storage, 'getItem'>,
  now = Date.now(),
): AnalyticsChoice | null {
  try {
    const value = JSON.parse(storage.getItem(ANALYTICS_CHOICE) ?? 'null')
    return value &&
      (value.choice === 'granted' || value.choice === 'denied') &&
      typeof value.at === 'number' &&
      value.at <= now &&
      now - value.at < MAX_AGE
      ? value.choice
      : null
  } catch {
    return null
  }
}
export function saveAnalyticsChoice(choice: AnalyticsChoice) {
  try {
    window.localStorage.setItem(ANALYTICS_CHOICE, JSON.stringify({ choice, at: Date.now() }))
    document.cookie = `${ANALYTICS_CHOICE}=${choice}; Path=/; Max-Age=${MAX_AGE / 1000}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  } catch {
    /* Blocked storage leaves analytics disabled. */
  }
  window.dispatchEvent(new Event(ANALYTICS_EVENT))
}
