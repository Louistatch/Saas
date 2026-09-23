'use client'

/**
 * Marché de proximité — page publique.
 *
 * Les annonces existaient déjà en base et étaient publiées depuis la carte du
 * producteur, mais aucune page ne les lisait : elles n'étaient visibles que
 * de leur propre auteur. C'est cette page qui les rend enfin trouvables.
 *
 * Ouverte aux visiteurs anonymes, volontairement : sur ce marché, l'acheteur
 * potentiel arrive souvent par un lien partagé, sans compte.
 */

import { EmptyState } from '@/components/shared/empty-state'
import { LoadingBlock } from '@/components/shared/loading'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MapPin, Phone, Search, Sprout, Store } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

interface Announcement {
  id: string
  type: 'job' | 'prevente' | 'mission' | 'autre'
  title: string
  description: string | null
  culture: string | null
  quantity_kg: number | null
  price_per_kg_fcfa: number | null
  contact_phone: string | null
  created_at: string
  canton: string | null
  prefecture: string | null
  region: string | null
  proximity: 0 | 1 | 2 | 3
}

const FILTERS = [
  { value: '', label: 'Tout' },
  { value: 'prevente', label: 'Préventes' },
  { value: 'job', label: 'Emplois' },
  { value: 'mission', label: 'Missions' },
  { value: 'autre', label: 'Autre' },
]

const TYPE_LABEL: Record<Announcement['type'], string> = {
  prevente: 'Prévente',
  job: "Offre d'emploi",
  mission: 'Mission de conseil',
  autre: 'Autre',
}

const PROXIMITY_LABEL: Record<Announcement['proximity'], string | null> = {
  0: 'Votre canton',
  1: 'Votre préfecture',
  2: 'Votre région',
  3: null,
}

/** Lien WhatsApp : le format wa.me exige un numéro sans + ni séparateurs. */
function whatsappLink(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  // Un numéro togolais saisi en local (8 chiffres) n'a pas son indicatif.
  const full = digits.length === 8 ? `228${digits}` : digits
  return `https://wa.me/${full}`
}

function formatAmount(value: number): string {
  return value.toLocaleString('fr-FR')
}

function AnnouncementCard({ item }: { item: Announcement }) {
  const place = [item.canton, item.prefecture, item.region].filter(Boolean).join(', ')
  const proximity = PROXIMITY_LABEL[item.proximity]

  return (
    <Card className="border-border">
      <CardContent className="pt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {TYPE_LABEL[item.type]}
          </span>
          {proximity && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              <MapPin className="h-3 w-3" /> {proximity}
            </span>
          )}
        </div>

        <div>
          <h3 className="font-bold text-foreground">{item.title}</h3>
          {item.description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{item.description}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {item.culture && (
            <span className="inline-flex items-center gap-1.5">
              <Sprout className="h-3.5 w-3.5" /> {item.culture}
            </span>
          )}
          {item.quantity_kg && <span>{formatAmount(item.quantity_kg)} kg</span>}
          {item.price_per_kg_fcfa && (
            <span className="font-medium text-foreground">
              {formatAmount(item.price_per_kg_fcfa)} FCFA/kg
            </span>
          )}
          {place && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> {place}
            </span>
          )}
        </div>

        {item.contact_phone && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" asChild>
              <a href={`tel:${item.contact_phone}`}>
                <Phone className="mr-1.5 h-4 w-4" /> Appeler
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={whatsappLink(item.contact_phone)} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function MarchePage() {
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const [zoneKnown, setZoneKnown] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (type) params.set('type', type)
    if (search.trim()) params.set('q', search.trim())
    try {
      const res = await fetch(`/api/market/announcements?${params}`)
      const data = await res.json()
      setItems(data.announcements ?? [])
      setZoneKnown(Boolean(data.zone_known))
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [type, search])

  // Le filtre par type s'applique tout de suite ; la recherche texte attend
  // une pause de frappe pour ne pas lancer une requête par caractère.
  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0)
    return () => clearTimeout(timer)
  }, [load, search])

  return (
    <MarketingLayout>
      <section className="border-b border-border bg-card/50 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Store className="h-3.5 w-3.5" /> Marché de proximité
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Ce qui se vend et se cherche près de chez vous
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            Préventes de récoltes, offres d&apos;emploi agricole et missions de conseil, publiées
            par les producteurs et les professionnels du réseau. Contact direct, sans intermédiaire.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative sm:max-w-sm sm:flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Culture, produit, mot-clé…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <Button
                  key={f.value}
                  size="sm"
                  variant={type === f.value ? 'default' : 'outline'}
                  onClick={() => setType(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          {zoneKnown && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              Classé par proximité avec votre zone.
            </p>
          )}
        </div>
      </section>

      <section className="py-10 sm:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {loading ? (
            <LoadingBlock />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Store}
              title="Aucune annonce pour le moment"
              description="Les producteurs et professionnels publient ici leurs préventes, offres et missions."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <AnnouncementCard key={item.id} item={item} />
              ))}
            </div>
          )}

          <div className="mt-10 rounded-xl border border-border bg-muted/30 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Vous avez une récolte à vendre, un chantier ou un besoin de conseil ?
            </p>
            <Button className="mt-3" asChild>
              <Link href="/haroo">Publier une annonce</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
