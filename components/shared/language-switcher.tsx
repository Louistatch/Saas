'use client'

import { useState, useEffect } from 'react'
import { getCurrentLocale, setLocale } from '@/lib/i18n'
import { Globe } from 'lucide-react'

/**
 * Compact language switcher.
 * Shows current language flag + allows switching.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const [locale, setCurrentLocale] = useState('fr')

  useEffect(() => {
    setCurrentLocale(getCurrentLocale())
  }, [])

  const toggle = () => {
    const next = locale === 'fr' ? 'en' : 'fr'
    setLocale(next)
  }

  return (
    <button
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border border-border hover:bg-accent/10 transition-colors ${className ?? ''}`}
      title={locale === 'fr' ? 'Switch to English' : 'Passer en français'}
    >
      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="uppercase">{locale}</span>
    </button>
  )
}
