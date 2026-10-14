'use client'

// Navigation d'AgriAcademy : six entrées sur ordinateur (barre latérale), quatre sur téléphone
// (barre d'onglets, 48 px de touche). « Leçons » et « Laboratoire » passent par des routes de
// reprise qui choisissent la leçon à ouvrir côté serveur ; « Certificat » renvoie au dossier.
import {
  BookOpen,
  FlaskConical,
  GraduationCap,
  Home,
  Map as MapIcon,
  ScrollText,
  Trophy,
  User,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const DESKTOP = [
  { href: '/operator/training', label: 'Mes formations', icon: Home, exact: true },
  { href: '/operator/training/cursus', label: 'Vue d’ensemble', icon: MapIcon, exact: true },
  {
    href: '/operator/training/resume',
    label: 'Mes cours',
    icon: BookOpen,
    match: '/operator/training/',
  },
  { href: '/operator/training/lab', label: 'Laboratoire', icon: FlaskConical, match: '/lab' },
  { href: '/operator/training#resultats', label: 'Résultats', icon: Trophy },
  { href: '/operator', label: 'Certificat', icon: ScrollText },
] as const

const MOBILE = [
  { href: '/operator/training', label: 'Accueil', icon: Home, exact: true },
  {
    href: '/operator/training/resume',
    label: 'Cours',
    icon: BookOpen,
    match: '/operator/training/',
  },
  { href: '/operator/training/lab', label: 'Labo', icon: FlaskConical, match: '/lab' },
  { href: '/operator', label: 'Moi', icon: User },
] as const

type Entry = (typeof DESKTOP)[number] | (typeof MOBILE)[number]

function isCurrent(entry: Entry, pathname: string): boolean {
  if ('exact' in entry && entry.exact) return pathname === entry.href
  if ('match' in entry && entry.match) {
    if (entry.match === '/lab') return pathname.endsWith('/lab')
    return pathname.startsWith(entry.match) && !pathname.endsWith('/lab')
  }
  return false
}

/** Dans une leçon (cours, exercice, évaluation), la barre du bas est celle de la leçon. */
const inLesson = (pathname: string) => /^\/operator\/training\/[0-9a-f-]{36}(\/|$)/.test(pathname)

export function AcademyNav() {
  const pathname = usePathname()
  return (
    <>
      <nav
        aria-label="AgriAcademy"
        className="hidden w-[236px] shrink-0 flex-col gap-1 bg-(--ac-emerald) px-5 py-7 text-(--ac-ground) md:sticky md:top-0 md:flex md:h-screen"
      >
        <div className="mb-5 flex items-center gap-2.5 px-2">
          <GraduationCap aria-hidden="true" className="h-7 w-7 text-(--ac-gold)" />
          <span className="academy-display text-[22px] font-semibold">AgriAcademy</span>
        </div>
        {DESKTOP.map((entry) => {
          const current = isCurrent(entry, pathname)
          return (
            <Link
              key={entry.label}
              href={entry.href}
              aria-current={current ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] ${
                current
                  ? 'bg-(--ac-ground)/12 font-semibold text-(--ac-ground)'
                  : 'font-medium text-(--ac-pale) hover:bg-(--ac-ground)/8 hover:text-(--ac-ground)'
              }`}
            >
              <entry.icon aria-hidden="true" className="h-[18px] w-[18px]" />
              {entry.label}
            </Link>
          )
        })}
        <p className="mt-auto border-t border-(--ac-ground)/18 px-3 pt-4 text-[13px] leading-relaxed text-(--ac-pale)">
          Formation gratuite. La certification se décide à l’évaluation pratique, jamais sur un
          quiz.
        </p>
      </nav>

      {!inLesson(pathname) && (
        <nav
          aria-label="AgriAcademy"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-(--ac-line) bg-white px-1.5 pt-1.5 pb-[max(10px,env(safe-area-inset-bottom))] md:hidden"
        >
          {MOBILE.map((entry) => {
            const current = isCurrent(entry, pathname)
            return (
              <Link
                key={entry.label}
                href={entry.href}
                aria-current={current ? 'page' : undefined}
                className={`flex min-h-12 flex-col items-center gap-1 pt-1.5 text-[11px] font-semibold ${
                  current ? 'text-(--ac-emerald)' : 'text-(--ac-muted)'
                }`}
              >
                <entry.icon aria-hidden="true" className="h-[22px] w-[22px]" />
                {entry.label}
              </Link>
            )
          })}
        </nav>
      )}
    </>
  )
}
