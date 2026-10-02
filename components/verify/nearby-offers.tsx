'use client'

import { useEffect, useState } from 'react'
import { MapPin, Phone } from 'lucide-react'

interface Offer {
  id: string
  title: string
  culture: string | null
  quantity_kg: number | null
  price_per_kg_fcfa: number | null
  contact_phone: string | null
  created_at: string
  canton: string | null
  prefecture: string | null
  region: string | null
  /** 0 = même canton … 3 = ailleurs (voir lib/market/announcements). */
  proximity: 0 | 1 | 2 | 3
}

interface Props {
  regionId?: string
  prefectureId?: string
  cantonId?: string
  /** Nom de la culture filtrée dans le tableau des prix, s'il y en a une. */
  culture?: string | null
}

const PROXIMITY_LABEL: Record<Offer['proximity'], string> = {
  0: 'Dans votre canton',
  1: 'Dans votre préfecture',
  2: 'Dans votre région',
  3: 'Ailleurs au Togo',
}

function ageLabel(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (!Number.isFinite(days) || days <= 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  if (days < 31) return `il y a ${days} jours`
  return `il y a ${Math.floor(days / 30)} mois`
}

/**
 * Préventes publiées par d'autres producteurs, sous les prix du Marché.
 *
 * Répartition voulue entre les deux écrans :
 *  - « Exploitation » sert à GÉRER mes annonces (publier, retirer) ;
 *  - « Marchés » sert à DÉCOUVRIR celles des autres, à côté des prix qui
 *    permettent de juger si une offre est correcte.
 * Une prévente est d'abord un objet de marché (culture, quantité, prix au kilo)
 * — elle n'avait aucune raison d'être visible seulement depuis la fiche de
 * celui qui la publie.
 *
 * La zone et la culture suivent les filtres du tableau des prix : une seule
 * façon de dire « ce qui m'intéresse », pas deux.
 */
export function NearbyOffers({ regionId, prefectureId, cantonId, culture }: Props) {
  const [offers, setOffers] = useState<Offer[] | null>(null)

  useEffect(() => {
    const params = new URLSearchParams({ type: 'prevente', limit: '40' })
    if (cantonId) params.set('canton', cantonId)
    if (prefectureId) params.set('prefecture', prefectureId)
    if (regionId) params.set('region', regionId)
    if (culture) params.set('q', culture)

    const controller = new AbortController()
    fetch(`/api/market/announcements?${params}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { announcements?: Offer[] } | null) => setOffers(d?.announcements ?? []))
      .catch(() => {
        if (!controller.signal.aborted) setOffers([])
      })
    return () => controller.abort()
  }, [regionId, prefectureId, cantonId, culture])

  // Rien tant que ça charge, et rien non plus quand il n'y a rien à montrer :
  // un encart « Aucune offre » sous chaque tableau de prix ferait du bruit.
  if (!offers || offers.length === 0) return null

  const shown = offers.slice(0, 4)

  return (
    <section className="space-y-2" aria-label="Offres de prévente près de chez vous">
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-sm font-bold text-white">Préventes proches</h3>
        <a
          href="/marche"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] font-semibold text-[var(--vfp-accent)] py-1"
        >
          Tout voir →
        </a>
      </div>

      {shown.map((o) => (
        <div key={o.id} className="vfp-card rounded-2xl p-3.5 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-white leading-snug">{o.title}</p>
            {o.price_per_kg_fcfa != null && (
              <span className="shrink-0 text-sm font-bold text-white">
                {o.price_per_kg_fcfa.toLocaleString('fr-FR')} F/kg
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/50">
            {o.culture && <span className="capitalize">{o.culture}</span>}
            {o.quantity_kg != null && <span>{o.quantity_kg.toLocaleString('fr-FR')} kg</span>}
            {(o.canton ?? o.prefecture) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {o.canton ?? o.prefecture}
              </span>
            )}
            <span className="text-white/30">{ageLabel(o.created_at)}</span>
          </div>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="text-[11px] text-white/35">{PROXIMITY_LABEL[o.proximity]}</span>
            {o.contact_phone && (
              <a
                href={`tel:${o.contact_phone.replace(/[^\d+]/g, '')}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--vfp-accent)]/12 border border-[var(--vfp-accent)]/25 px-3.5 py-2 text-[13px] font-semibold text-[var(--vfp-accent)] active:scale-95 transition-transform"
              >
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                Appeler
              </a>
            )}
          </div>
        </div>
      ))}
    </section>
  )
}
