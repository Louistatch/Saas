'use client'

import { HUBS, type HubId } from '@/lib/haroolife/territory-simulation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CircleMarker, Map, Polyline } from 'leaflet'

// Geographic framing only: this rectangle is NOT an administrative border.
const TOGO_VIEW_BOUNDS: [[number, number], [number, number]] = [
  [6.05, -0.22],
  [11.20, 1.85],
]

/** Browser-only Leaflet map. Real basemap; economic overlays are illustrative. */
export default function TerritoryMap({
  selected,
  onSelect,
  routeActive = false,
}: {
  selected: HubId
  onSelect: (hub: HubId) => void
  routeActive?: boolean
}) {
  const container = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<Map | null>(null)
  const markers = useRef<Partial<Record<HubId, CircleMarker>>>({})
  const corridor = useRef<Polyline | null>(null)
  const selectRef = useRef(onSelect)
  const previousSelected = useRef<HubId>(selected)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    selectRef.current = onSelect
  }, [onSelect])

  const showCountry = useCallback(() => {
    const map = leafletMap.current
    if (!map) return
    // The map can be created before the mobile layout has reached its final size.
    // invalidateSize alone does not recompute a previous fitBounds zoom level.
    map.invalidateSize({ pan: false })
    map.fitBounds(TOGO_VIEW_BOUNDS, { animate: false, padding: [16, 16] })
  }, [])

  useEffect(() => {
    let cancelled = false
    let raf = 0
    let resizeObserver: ResizeObserver | null = null
    void import('leaflet')
      .then((L) => {
        if (cancelled || !container.current) return
        const map = L.map(container.current, {
          scrollWheelZoom: false,
          zoomControl: true,
          minZoom: 5,
          maxZoom: 15,
        })
        leafletMap.current = map

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map)

        for (const hub of HUBS) {
          const point = L.circleMarker([hub.lat, hub.lng], {
            radius: hub.id === 'lome' || hub.id === 'kpalime' ? 11 : 8,
            color: '#064e3b',
            fillColor: hub.id === selected ? '#f59e0b' : '#10b981',
            fillOpacity: 0.95,
            weight: 3,
          }).addTo(map)
          point.bindTooltip(`${hub.name} — ${hub.role}`, {
            direction: 'top',
            permanent: hub.id === 'lome' || hub.id === 'kpalime',
          })
          point.on('click', () => selectRef.current(hub.id))
          markers.current[hub.id] = point
        }

        const lome = HUBS.find((hub) => hub.id === 'lome')!
        const kpalime = HUBS.find((hub) => hub.id === 'kpalime')!
        const line = L.polyline(
          [
            [kpalime.lat, kpalime.lng],
            [lome.lat, lome.lng],
          ],
          {
            color: '#64748b',
            weight: 3,
            opacity: 0.35,
            dashArray: '7 7',
          },
        ).addTo(map)
        line.bindTooltip('Corridor commercial illustratif, pas un tracé routier')
        corridor.current = line

        // A second animation frame allows mobile flex/grid dimensions to settle.
        raf = window.requestAnimationFrame(() => {
          raf = window.requestAnimationFrame(() => {
            if (cancelled) return
            showCountry()
            setReady(true)
          })
        })
        // Rotation or split-screen: refresh tiles without overriding user's zoom.
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => {
            if (!cancelled) map.invalidateSize({ pan: false })
          })
          resizeObserver.observe(container.current)
        }
      })
      .catch(() => {
        if (!cancelled) setError('La carte n’a pas pu être chargée. Utilisez la liste des villes.')
      })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
      resizeObserver?.disconnect()
      leafletMap.current?.remove()
      leafletMap.current = null
      markers.current = {}
      corridor.current = null
    }
    // Intentionally initialize the Leaflet canvas only once; selections are updated below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCountry])

  useEffect(() => {
    for (const hub of HUBS) {
      markers.current[hub.id]?.setStyle({
        fillColor: hub.id === selected ? '#f59e0b' : '#10b981',
        color: hub.id === selected ? '#78350f' : '#064e3b',
        weight: hub.id === selected ? 4 : 3,
      })
    }
    // A layout-ready change must NOT count as a user selection.
    const changed = previousSelected.current !== selected
    previousSelected.current = selected
    if (!changed) return
    const hub = HUBS.find((item) => item.id === selected)
    if (hub && ready && leafletMap.current) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      leafletMap.current.flyTo([hub.lat, hub.lng], 9, {
        animate: !reduce,
        duration: 0.65,
      })
    }
  }, [selected, ready])

  useEffect(() => {
    corridor.current?.setStyle({
      color: routeActive ? '#059669' : '#64748b',
      opacity: routeActive ? 0.95 : 0.35,
      weight: routeActive ? 5 : 3,
    })
  }, [routeActive, ready])

  return (
    <div className="relative">
      <div className="relative">
        <div
          ref={container}
          role="region"
          aria-label="Carte interactive du Togo et de cinq villes"
          className="z-0 h-[500px] w-full overflow-hidden rounded-2xl bg-emerald-50 sm:h-[560px]"
        />
        <button
          type="button"
          onClick={showCountry}
          disabled={!ready}
          className="absolute right-3 top-3 z-[500] rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-900 shadow-md disabled:opacity-50"
        >
          Voir tout le Togo
        </button>
        <span className="pointer-events-none absolute bottom-7 left-3 z-[400] rounded-md bg-white/95 px-2 py-1 text-[11px] font-medium text-slate-700">
          {routeActive ? 'Corridor commercial actif (fictif)' : 'Corridor commercial à développer'}
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Carte réelle, cinq repères géographiques. La ligne Kpalimé–Lomé est schématique,
        sans itinéraire ni distance routière calculés. Touchez une ville pour zoomer.
      </p>
    </div>
  )
}
