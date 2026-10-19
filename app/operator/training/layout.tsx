import { AcademyNav } from '@/components/academy/nav'
import { Fraunces, Manrope } from 'next/font/google'
import type { ReactNode } from 'react'

// Polices servies par next/font (auto-hébergées : la CSP n'autorise que font-src 'self').
const display = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-academy-display',
})
const body = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-academy-body',
})

/**
 * Coquille AgriAcademy (J3) : barre latérale sur ordinateur, barre d'onglets sur téléphone.
 * Les données (progression, leçons) restent chargées par chaque page ; la coquille ne fait
 * aucune requête, pour que la navigation reste instantanée.
 */
export default function AcademyLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`academy ${display.variable} ${body.variable} min-h-screen md:flex`}>
      <AcademyNav />
      <div className="min-w-0 flex-1 pb-20 md:pb-0">{children}</div>
    </div>
  )
}
