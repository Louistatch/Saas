'use client'

/**
 * Espace Haroo : ce qui attend dans « Mon suivi » (réponses à décider, invitations, réponses
 * retenues) et les portes du marché et du travail.
 */
import { Button } from '@/components/ui/button'
import { isError, unreadCount } from '@/lib/market/client'
import { Briefcase, Inbox, PlusCircle, Store } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export function MarketActivityCard() {
  const [unread, setUnread] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    void unreadCount().then((n) => {
      if (alive) setUnread(isError(n) ? null : n)
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <section
      aria-labelledby="market-activity-title"
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="market-activity-title" className="text-lg font-semibold">
            Marché et travail
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {unread && unread > 0
              ? `${unread} chose${unread > 1 ? 's' : ''} à voir : réponses, invitations, décisions.`
              : 'Vos annonces, vos réponses et les invitations reçues.'}
          </p>
        </div>
        <Button asChild className="h-11 gap-2">
          <Link href="/marche/suivi">
            <Inbox aria-hidden="true" className="h-4 w-4" /> Mon suivi
            {unread && unread > 0 ? (
              <span className="rounded-full bg-background/20 px-1.5 text-xs font-bold tabular-nums">
                {unread}
              </span>
            ) : null}
          </Link>
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Button asChild variant="outline" className="h-11 gap-1.5 px-2">
          <Link href="/travail">
            <Briefcase aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="truncate">Travail</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11 gap-1.5 px-2">
          <Link href="/marche">
            <Store aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="truncate">Marché</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11 gap-1.5 px-2">
          <Link href="/marche/publier">
            <PlusCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="truncate">Publier</span>
          </Link>
        </Button>
      </div>
    </section>
  )
}
