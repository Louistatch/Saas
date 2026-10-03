'use client'

import type { MarketAnnouncement } from '@/lib/market/announcements'
import { MapPin, Phone, Sprout } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * Préventes des producteurs (annonces du marché de proximité) affichées à côté
 * des produits : une prévente publiée depuis l'espace Exploitation ou Haroo
 * apparaît ici, visible de tous, sans compte.
 */
export function PresalesStrip() {
  const [items, setItems] = useState<MarketAnnouncement[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/market/announcements?type=prevente&limit=24', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { announcements: [] }))
      .then((j) => setItems(j.announcements ?? []))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  if (!items || items.length === 0) return null
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Préventes des producteurs</h2>
        <Link href="/marche" className="text-sm text-primary hover:underline">
          Tout le marché →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map((a) => {
          const place = a.canton ?? a.prefecture ?? a.region
          return (
            <article key={a.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
              <p className="font-medium text-foreground line-clamp-2">{a.title}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {a.culture ? (
                  <span className="inline-flex items-center gap-1">
                    <Sprout className="h-3 w-3" /> {a.culture}
                  </span>
                ) : null}
                {place ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {place}
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-foreground">
                {a.quantity_kg ? `${Number(a.quantity_kg).toLocaleString('fr-FR')} kg` : null}
                {a.quantity_kg && a.price_per_kg_fcfa ? ' · ' : null}
                {a.price_per_kg_fcfa
                  ? `${Number(a.price_per_kg_fcfa).toLocaleString('fr-FR')} FCFA/kg`
                  : null}
              </p>
              {a.contact_phone ? (
                <a
                  href={`tel:${a.contact_phone.replace(/\s/g, '')}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" /> {a.contact_phone}
                </a>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}
