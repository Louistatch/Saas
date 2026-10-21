'use client'

/**
 * HarooLife proposals of field work, on the Haroo dashboard: a player asked this ouvrier to tend
 * their game field. Accepting pays the ouvrier in game money (collected in HarooLife); nothing
 * binds anyone outside the game. Shown only when something waits for an answer.
 * See components/haroolife/field-workers.tsx for the game side.
 */
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CROPS, type CropId } from '@/lib/haroolife/city/farm'
import { LOCALITIES, type LocalityId } from '@/lib/haroolife/city/locality'
import type { FieldOffer } from '@/lib/haroolife/city/workers'
import { answerOffer, isError, myOffers } from '@/lib/haroolife/field-work'
import { Sprout } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`

export function HarooLifeFieldOffersCard() {
  const [asked, setAsked] = useState<FieldOffer[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const load = useCallback(async () => {
    const got = await myOffers()
    if (!isError(got)) setAsked(got.asked)
  }, [])
  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(t)
  }, [load])

  if (process.env.NEXT_PUBLIC_HAROOLIFE_ENABLED !== 'true' || (!asked.length && !said)) return null

  const answer = async (o: FieldOffer, accept: boolean) => {
    setBusy(o.id)
    const r = await answerOffer(o.id, accept)
    setBusy(null)
    if (isError(r)) setSaid(r.error)
    else if (r.status === 'accepted')
      setSaid(`Accepté : ${money(r.pay)} du jeu vous attendent dans HarooLife.`)
    else if (r.status === 'declined') setSaid(`Refusé. Réponse envoyée à ${r.employer}.`)
    else setSaid(r.reason ?? 'Cette proposition n’attend plus de réponse.')
    void load()
  }

  return (
    <Card data-testid="haroolife-field-offers">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sprout className="h-5 w-5 text-emerald-700" aria-hidden />
          Travail au champ dans HarooLife
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {asked.map((o) => (
          <div key={o.id} className="rounded-lg border p-3">
            <p className="text-sm">
              <span className="font-semibold">{o.employer}</span> vous propose{' '}
              {o.days > 1 ? `${o.days} jours` : 'une journée'} au champ de{' '}
              {CROPS[o.crop as CropId]?.name.toLowerCase() ?? o.crop} à{' '}
              {LOCALITIES[o.locality as LocalityId]?.name ?? o.locality} ·{' '}
              <span className="font-semibold">{money(o.pay)} du jeu</span>
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" disabled={busy === o.id} onClick={() => void answer(o, true)}>
                Accepter
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === o.id}
                onClick={() => void answer(o, false)}
              >
                Refuser
              </Button>
            </div>
          </div>
        ))}
        {said && <output className="block text-sm font-medium text-emerald-800">{said}</output>}
        <p className="text-xs text-muted-foreground">
          Travail dans le jeu, payé en argent du jeu : aucun engagement réel, votre numéro n’est pas
          communiqué.{' '}
          <Link href="/haroolife" className="font-semibold text-emerald-800 hover:underline">
            Ouvrir HarooLife
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
