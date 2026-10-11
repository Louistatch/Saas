'use client'

import { HUBS, type HubId } from '@/lib/haroolife/territory-simulation'
import { useEffect, useRef, useState } from 'react'
import type { CircleMarker, Map } from 'leaflet'

/** Browser-only Leaflet map. Real basemap, illustrative simulation pins. */
export default function TerritoryMap({
  selected,
  onSelect,
}: {
  selected: HubId
  onSelect: (hub: HubId) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<Map | null>(null)
  const markers = useRef<Partial<Record<HubId, CircleMarker>>>({})
  const selectRef = useRef(onSelect)
  const [error, setError] = useState('')
  useEffect(() => {
    selectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    let cancelled = false
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
        map.fitBounds(
          [
            [5.85, -0.1],
            [11.25, 1.95],
          ],
          { padding: [18, 18] },
        )
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map)
        for (const hub of HUBS) {
          const point = L.circleMarker([hub.lat, hub.lng], {
            radius: hub.id === 'lome' || hub.id === 'kpalime' ? 11 : 8,
            color: '#064e3b',
            fillColor: '#10b981',
            fillOpacity: 0.9,
            weight: 3,
          }).addTo(map)
          point.bindTooltip(`${hub.name} — ${hub.role}`, { direction: 'top' })
          point.on('click', () => selectRef.current(hub.id))
          markers.current[hub.id] = point
        }
        // Recompute when the panel becomes visible or the browser resizes.
        window.requestAnimationFrame(() => {
          if (!cancelled) map.invalidateSize()
        })
      })
      .catch(() => {
        if (!cancelled) setError('La carte n’a pas pu être chargée. Utilisez la liste des villes.')
      })
    return () => {
      cancelled = true
      leafletMap.current?.remove()
      leafletMap.current = null
      markers.current = {}
    }
  }, [])

  useEffect(() => {
    for (const hub of HUBS) {
      markers.current[hub.id]?.setStyle({
        fillColor: hub.id === selected ? '#f59e0b' : '#10b981',
        color: hub.id === selected ? '#78350f' : '#064e3b',
        weight: hub.id === selected ? 4 : 3,
      })
    }
  }, [selected])

  return (
    <div className="relative">
      <div
        ref={container}
        aria-label="Carte interactive du Togo et de cinq villes"
        className="z-0 h-[390px] w-full overflow-hidden rounded-2xl bg-emerald-50 sm:h-[510px]"
      />
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Repères géographiques réels ; entreprises, productions et flux économiques fictifs.
        Zoomez ou touchez une ville.
      </p>
    </div>
  )
}
