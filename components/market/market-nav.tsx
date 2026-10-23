'use client'

/**
 * Les quatre portes du marché et du travail, sur chaque page : chercher (marché, travail),
 * publier, suivre. Le badge de « Mon suivi » compte les décisions à prendre et les nouvelles.
 */
import { useAuth } from '@/app/context/auth-context'
import { isError, unreadCount } from '@/lib/market/client'
import { Briefcase, Inbox, PlusCircle, Store } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const LINKS = [
  { href: '/marche', label: 'Marché', icon: Store },
  { href: '/travail', label: 'Travail', icon: Briefcase },
  { href: '/marche/publier', label: 'Publier', icon: PlusCircle },
  { href: '/marche/suivi', label: 'Mon suivi', icon: Inbox },
] as const

export function MarketNav({ unread: given }: { unread?: number }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (given !== undefined || !user) return
    let alive = true
    void unreadCount().then((n) => {
      if (alive && !isError(n)) setUnread(n)
    })
    return () => {
      alive = false
    }
  }, [user, given])

  const count = given ?? unread

  return (
    <nav aria-label="Marché et travail" className="border-b border-border bg-background">
      <ul className="mx-auto grid max-w-7xl grid-cols-4 px-2 sm:flex sm:gap-2 sm:px-6 lg:px-8">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 text-xs font-medium sm:min-h-12 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
                  active
                    ? 'text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="relative">
                  <Icon aria-hidden="true" className="h-5 w-5 sm:h-4 sm:w-4" />
                  {href === '/marche/suivi' && count > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] font-bold leading-4 text-white tabular-nums">
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                </span>
                <span className="truncate">{label}</span>
                {href === '/marche/suivi' && count > 0 && (
                  <span className="sr-only"> ({count} à voir)</span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
