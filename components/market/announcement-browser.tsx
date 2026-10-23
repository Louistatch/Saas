'use client'

/**
 * La liste d'annonces de /marche et de /travail : recherche, type, zone, puis les annonces du
 * plus proche au plus loin, groupées (canton, préfecture, région, ailleurs). Le type et la zone
 * restent dans l'adresse, pour qu'un lien partagé sur WhatsApp ouvre la même liste.
 */
import { AnnouncementCard } from '@/components/market/announcement-card'
import { ProximityMark } from '@/components/market/proximity-mark'
import { useMyResponses } from '@/components/market/use-my-responses'
import { EMPTY_ZONE, ZoneSelect, type ZoneValue } from '@/components/market/zone-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { type AnnouncementType, type MarketAnnouncement, groupByProximity } from '@/lib/market/work'
import { MapPin, PlusCircle, Search, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

export interface TypeFilter {
  value: AnnouncementType | ''
  label: string
}

const TYPES: AnnouncementType[] = ['prevente', 'job', 'mission', 'autre']

export function AnnouncementBrowser({
  filters,
  fixedType,
  publishHref,
  publishLabel,
  emptyTitle,
  emptyText,
  searchPlaceholder = 'Culture, travail, mot-clé…',
}: {
  /** Les types proposés en filtre ; absent quand la page n'en montre qu'un (`fixedType`). */
  filters?: TypeFilter[]
  fixedType?: AnnouncementType
  publishHref: string
  publishLabel: string
  emptyTitle: string
  emptyText: string
  searchPlaceholder?: string
}) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const urlType = params.get('type') as AnnouncementType | null
  const [type, setType] = useState<AnnouncementType | ''>(
    fixedType ?? (urlType && TYPES.includes(urlType) ? urlType : ''),
  )
  const [search, setSearch] = useState('')
  const [zone, setZone] = useState<ZoneValue>({
    regionId: params.get('region') ?? '',
    prefectureId: params.get('prefecture') ?? '',
    cantonId: params.get('canton') ?? '',
  })
  const [showZone, setShowZone] = useState(Boolean(params.get('region')))
  const [items, setItems] = useState<MarketAnnouncement[]>([])
  const [zoneKnown, setZoneKnown] = useState(false)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const { byAnnouncement, record } = useMyResponses()

  const load = useCallback(async () => {
    setState('loading')
    const query = new URLSearchParams()
    if (type) query.set('type', type)
    if (search.trim()) query.set('q', search.trim())
    if (zone.cantonId) query.set('canton', zone.cantonId)
    else if (zone.prefectureId) query.set('prefecture', zone.prefectureId)
    else if (zone.regionId) query.set('region', zone.regionId)
    try {
      const res = await fetch(`/api/market/announcements?${query}`)
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as {
        announcements?: MarketAnnouncement[]
        zone_known?: boolean
      }
      setItems(data.announcements ?? [])
      setZoneKnown(Boolean(data.zone_known))
      setState('ready')
    } catch {
      setItems([])
      setState('error')
    }
  }, [type, search, zone])

  // Le type et la zone s'appliquent tout de suite ; la recherche attend une pause de frappe.
  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0)
    return () => clearTimeout(timer)
  }, [load, search])

  // L'adresse suit les filtres (sans recharger la page), pour partager la même liste.
  useEffect(() => {
    const current = params.toString()
    const next = new URLSearchParams(current)
    const managed: [string, string][] = [
      ['type', fixedType ? '' : type],
      ['region', zone.regionId],
      ['prefecture', zone.prefectureId],
      ['canton', zone.cantonId],
    ]
    for (const [key, value] of managed) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    const target = next.toString()
    if (target !== current) {
      router.replace(target ? `${pathname}?${target}` : pathname, { scroll: false })
    }
  }, [type, zone, fixedType, pathname, router, params])

  const groups = useMemo(
    () => (zoneKnown ? groupByProximity(items) : [{ rank: 3 as const, label: '', items }]),
    [items, zoneKnown],
  )

  return (
    <div>
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Rechercher"
              className="h-11 pl-10"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant={showZone || zone.regionId ? 'default' : 'outline'}
            className="h-11 shrink-0 gap-2"
            aria-expanded={showZone}
            aria-controls="market-zone"
            onClick={() => setShowZone((s) => !s)}
          >
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">Zone</span>
          </Button>
        </div>

        {showZone && (
          <div id="market-zone" className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <MapPin aria-hidden="true" className="h-4 w-4 text-primary" /> Près de quel endroit ?
            </p>
            <ZoneSelect value={zone} onChange={setZone} idPrefix="market-zone" />
            {zone.regionId && (
              <button
                type="button"
                className="mt-2 text-sm font-medium text-muted-foreground underline underline-offset-2"
                onClick={() => setZone(EMPTY_ZONE)}
              >
                Effacer la zone
              </button>
            )}
          </div>
        )}

        {filters && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {filters.map((f) => (
              <button
                key={f.value || 'all'}
                type="button"
                aria-pressed={type === f.value}
                onClick={() => setType(f.value)}
                className={`h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors ${
                  type === f.value
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background text-foreground hover:border-foreground/40'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6" aria-live="polite" aria-busy={state === 'loading'}>
        {state === 'loading' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        ) : state === 'error' ? (
          <div className="rounded-2xl border border-border p-6 text-center">
            <p className="font-semibold">Les annonces n’ont pas pu être chargées.</p>
            <p className="mt-1 text-sm text-muted-foreground">Vérifiez votre connexion.</p>
            <Button className="mt-4 h-11" variant="outline" onClick={() => void load()}>
              Réessayer
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
            <p className="text-lg font-semibold">{emptyTitle}</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{emptyText}</p>
            <Button asChild className="mt-5 h-11 gap-2">
              <Link href={publishHref}>
                <PlusCircle aria-hidden="true" className="h-4 w-4" /> {publishLabel}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {!zoneKnown && (
              <p className="flex items-start gap-2 rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Les plus récentes d’abord.{' '}
                  <button
                    type="button"
                    className="font-medium text-foreground underline underline-offset-2"
                    onClick={() => setShowZone(true)}
                  >
                    Choisissez votre zone
                  </button>{' '}
                  pour voir d’abord ce qui est près de chez vous.
                </span>
              </p>
            )}
            {groups.map((group) => (
              <section key={group.rank} aria-label={group.label || 'Annonces'}>
                {group.label && (
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ProximityMark rank={group.rank} className="h-4 w-4 text-primary" />
                    {group.label}
                    <span className="font-normal text-muted-foreground tabular-nums">
                      {group.items.length}
                    </span>
                  </h2>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((item) => (
                    <AnnouncementCard
                      key={item.id}
                      item={item}
                      showProximity={false}
                      status={byAnnouncement[item.id]}
                      onResponded={(s) => record(item.id, s)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
