'use client'

/** Cartes émises : les miennes (agent) ou celles de toute l'équipe (gérant), avec impression. */

import { Spinner } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
import { CARD_FORMAT_LABEL } from '@/lib/payg/model'
import { Download, Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, formatDate, withPartner } from './api'
import type { IssuedCard } from './types'

export function IssuedCards({
  partnerId,
  canPrint,
  showIssuer,
  exportable,
  refreshKey,
}: {
  partnerId: string
  canPrint: boolean
  showIssuer: boolean
  exportable: boolean
  refreshKey?: number
}) {
  const [cards, setCards] = useState<IssuedCard[] | null>(null)
  const [error, setError] = useState('')

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey relance la lecture après une émission
  useEffect(() => {
    setCards(null)
    api<{ cards: IssuedCard[] }>(withPartner('/api/payg/cards', partnerId)).then((res) => {
      if (res.ok) setCards(res.data.cards)
      else {
        setError(res.error)
        setCards([])
      }
    })
  }, [partnerId, refreshKey])

  return (
    <section aria-labelledby="issued-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="issued-title" className="text-base font-semibold text-foreground">
          {showIssuer ? 'Cartes émises par l’équipe' : 'Mes cartes émises'}
        </h2>
        {exportable && (
          <Button variant="outline" size="sm" asChild>
            <a href={withPartner('/api/institution/reports?type=cards', partnerId)}>
              <Download className="mr-1.5 h-4 w-4" /> CSV
            </a>
          </Button>
        )}
      </div>
      {cards === null ? (
        <div className="flex justify-center py-8" aria-busy="true">
          <Spinner className="h-5 w-5" />
        </div>
      ) : cards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {error || 'Aucune carte émise pour l’instant.'}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {cards.map((c) => (
            <li
              key={c.member_card_id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{c.producer}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.card_number}, {c.cooperative}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.mode === 'free_allowance'
                    ? 'Numérique gratuite'
                    : `${CARD_FORMAT_LABEL[c.card_format]}, ${
                        c.commission_status === 'released'
                          ? 'crédit rendu'
                          : c.source === 'welcome'
                            ? 'crédit offert'
                            : '1 crédit'
                      }`}
                  {`, ${formatDate(c.issued_at)}`}
                  {showIssuer && c.issued_by ? `, par ${c.issued_by}` : ''}
                </p>
              </div>
              {canPrint && c.card_status === 'active' && (
                <Button variant="outline" size="sm" className="min-h-10 shrink-0" asChild>
                  <a href={withPartner(`/api/payg/cards/${c.member_card_id}/print`, partnerId)}>
                    <Printer className="mr-1.5 h-4 w-4" />
                    <span className="sr-only sm:not-sr-only">Imprimer</span>
                  </a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
