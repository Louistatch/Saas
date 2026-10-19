'use client'

/**
 * Inside a market: the real offers (Haroo presales, producers' presale announcements).
 * Figures come from the API; contact goes through the existing Haroo pages, never a phone
 * number in the game.
 */
import type { Actor } from '@/lib/haroolife/domain/actor'
import { HttpMarketService } from '@/lib/haroolife/domain/http'
import type { Offer } from '@/lib/haroolife/domain/services'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const service = new HttpMarketService()
const fcfa = (n: number) => `${new Intl.NumberFormat('fr-FR').format(n)} FCFA`
const kg = (n: number) => `${new Intl.NumberFormat('fr-FR').format(n)} kg`

export default function MarketPanel({ actor }: { actor: Actor | null }) {
  const [offers, setOffers] = useState<Offer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [culture, setCulture] = useState('')
  useEffect(() => {
    if (!actor) return
    let alive = true
    setOffers(null)
    service
      .offers({ culture })
      .then((o) => alive && setOffers(o))
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [actor, culture])
  if (!actor)
    return (
      <p className="text-sm text-slate-600">
        <Link
          href="/auth/login?redirect=%2Fharoolife"
          className="font-bold text-emerald-700 underline"
        >
          Connectez-vous
        </Link>{' '}
        pour voir les préventes réelles des producteurs.
      </p>
    )
  if (error)
    return (
      <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">
        {error}
      </p>
    )
  const cultures = [...new Set((offers ?? []).map((o) => o.culture))].sort()
  return (
    <div className="space-y-3" data-testid="market-offers">
      <p className="text-sm text-slate-600">
        Offres réelles publiées sur Haroo et par les producteurs. La mise en relation se fait sur
        Haroo, jamais par le jeu.
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par culture">
        <button
          type="button"
          aria-pressed={culture === ''}
          onClick={() => setCulture('')}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${culture === '' ? 'bg-emerald-700 text-white' : 'bg-slate-100'}`}
        >
          Toutes
        </button>
        {cultures.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={culture === c}
            onClick={() => setCulture(c)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${culture === c ? 'bg-emerald-700 text-white' : 'bg-slate-100'}`}
          >
            {c}
          </button>
        ))}
      </div>
      {offers === null && <p className="text-sm text-slate-500">Chargement des offres…</p>}
      {offers && offers.length === 0 && (
        <p className="text-sm text-slate-500">Aucune offre disponible pour le moment.</p>
      )}
      <ul className="space-y-2" aria-label="Offres">
        {(offers ?? []).map((o) => (
          <li key={o.id} className="rounded-2xl bg-white p-3 text-sm ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-bold">{o.title}</p>
                <p className="text-xs text-slate-500">
                  {o.culture}
                  {o.canton ? ` · ${o.canton}` : ''} ·{' '}
                  {o.kind === 'presale' ? 'Prévente Haroo' : 'Annonce de producteur'}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                {o.pricePerKg != null ? `${fcfa(o.pricePerKg)}/kg` : 'Prix à discuter'}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-slate-600">
                {o.quantityKg != null ? kg(o.quantityKg) : 'Quantité à préciser'}
              </span>
              {o.contactPath && (
                <Link href={o.contactPath} className="text-xs font-bold text-emerald-700 underline">
                  Voir sur Haroo
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
