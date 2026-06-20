'use client'
// This component must be imported with dynamic({ ssr: false })

import { useEffect, useRef, useState } from 'react'

interface Props {
  region: string
  city: string
  className?: string
}

type LatLng = [number, number]

const REGION_CENTERS: Record<string, LatLng> = {
  Maritime:  [6.137,  1.212],
  Plateaux:  [7.530,  1.150],
  Centrale:  [8.980,  1.095],
  Kara:      [9.551,  1.186],
  Savanes:   [10.863, 0.207],
}

interface RainViewerManifest {
  version: string
  generated: number
  host: string
  radar: {
    past: { time: number; path: string }[]
    nowcast?: { time: number; path: string }[]
  }
  satellite?: unknown
}

export default function RainRadar({ region, city, className }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState<string>('Live')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!mapRef.current) return

    let map: import('leaflet').Map | null = null
    let cancelled = false

    async function init() {
      // Dynamic import so this only runs client-side
      await import('leaflet/dist/leaflet.css')
      const L = (await import('leaflet')).default

      // Fix Leaflet default icon paths (broken by bundlers)
      L.Icon.Default.mergeOptions({
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      if (cancelled || !mapRef.current) return

      const center: LatLng =
        REGION_CENTERS[region] ?? REGION_CENTERS['Maritime']

      map = L.map(mapRef.current, {
        center,
        zoom: 8,
        zoomControl: true,
        attributionControl: true,
      })

      // Base layer — OpenStreetMap
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      // Fetch RainViewer manifest
      try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json')
        if (!res.ok) throw new Error('manifest fetch failed')
        const manifest: RainViewerManifest = await res.json()

        const past = manifest.radar?.past ?? []
        if (past.length > 0 && !cancelled && map) {
          const latest = past[past.length - 1]
          const ts = latest.time

          // Show human-readable timestamp label
          const d = new Date(ts * 1000)
          setLabel(
            d.toLocaleTimeString('fr-TG', {
              hour:   '2-digit',
              minute: '2-digit',
              timeZone: 'Africa/Lagos',
            })
          )

          L.tileLayer(
            `https://tilecache.rainviewer.com/v2/radar/${ts}/512/{z}/{x}/{y}/2/1_1.png`,
            {
              opacity:     0.6,
              tileSize:    256,
              attribution: '&copy; <a href="https://rainviewer.com">RainViewer</a>',
            }
          ).addTo(map)
        }
      } catch {
        // radar overlay is non-critical — map still renders
      }

      if (!cancelled) setLoading(false)
    }

    init()

    return () => {
      cancelled = true
      map?.remove()
      map = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, refreshKey])

  return (
    <div className={`relative ${className ?? ''}`}>
      {/* Map container */}
      <div
        ref={mapRef}
        className="h-52 w-full rounded-2xl overflow-hidden"
      />

      {/* Loading spinner */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-2xl pointer-events-none">
          <div className="h-8 w-8 rounded-full border-4 border-white border-t-transparent animate-spin" />
        </div>
      )}

      {/* Live badge */}
      {!loading && (
        <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
          <span className="text-red-400">&#9679;</span>
          <span>{label === 'Live' ? 'Live' : label}</span>
        </div>
      )}

      {/* Refresh button */}
      <button
        type="button"
        onClick={() => {
          setLoading(true)
          setLabel('Live')
          setRefreshKey(k => k + 1)
        }}
        className="absolute top-2 right-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur-sm hover:bg-black/80 transition-colors"
      >
        Actualiser
      </button>

      {/* City label */}
      <div className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
        {city}
      </div>
    </div>
  )
}
