/**
 * Lightweight i18n module for FaîtiereHub.
 * 
 * Usage in any client component:
 *   import { useT } from '@/lib/i18n'
 *   const t = useT()
 *   t('common.save') // → "Enregistrer"
 *   t('dashboard.welcome', { name: 'Ama' }) // → "Bienvenue, Ama 👋"
 * 
 * To change language: update the locale in localStorage and reload.
 * Default: 'fr' (French)
 */

import frMessages from '@/messages/fr.json'
import enMessages from '@/messages/en.json'

type Messages = typeof frMessages
type NestedKeyOf<T, Prefix extends string = ''> = T extends object
  ? { [K in keyof T]: K extends string
      ? T[K] extends object
        ? NestedKeyOf<T[K], `${Prefix}${K}.`>
        : `${Prefix}${K}`
      : never
    }[keyof T]
  : never

export type TranslationKey = NestedKeyOf<Messages>

const messages: Record<string, Messages> = {
  fr: frMessages,
  en: enMessages as unknown as Messages,
}

function getLocale(): string {
  if (typeof window === 'undefined') return 'fr'
  return localStorage.getItem('faitierehub_locale') ?? 'fr'
}

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return path // fallback: return the key itself
    }
  }
  return typeof current === 'string' ? current : path
}

/**
 * Translate a key with optional interpolation.
 * Example: t('dashboard.welcome', { name: 'Ama' })
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const locale = getLocale()
  const msgs = messages[locale] ?? messages.fr
  let value = getNestedValue(msgs as unknown as Record<string, unknown>, key)

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(`{${k}}`, String(v))
    }
  }

  return value
}

/**
 * React hook for translations.
 * Returns the t() function bound to the current locale.
 */
export function useT() {
  return t
}

/**
 * Set the locale and reload the page.
 */
export function setLocale(locale: 'fr' | 'en') {
  if (typeof window !== 'undefined') {
    localStorage.setItem('faitierehub_locale', locale)
    window.location.reload()
  }
}

/**
 * Get the current locale.
 */
export function getCurrentLocale(): string {
  return getLocale()
}
