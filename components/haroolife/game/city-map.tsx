'use client'

/**
 * The clear map of the town (HarooLife engine): districts with their names, water, readable
 * roads and the Saas destinations (same lots, same ids). What is shown depends on the zoom:
 * far, the districts and the main destinations; nearer, every named place of the active filter;
 * close, their names. Markers never overlap (greedy placement by priority, the selected place
 * first). Touching a place opens its existing sheet (name, district, activities, trip, cost,
 * Aller). Pure SVG: sharp on a phone, no WebGL context.
 */
import {
  CATEGORY_OF,
  type Category,
  type Lot,
  type LotType,
  TYPE_ICONS,
  WORLD_H,
  WORLD_W,
  districts,
  inEstate,
  isCityRoad,
  landmarks,
  terrainAt,
} from '@/lib/haroolife/city/world'
import { useEffect, useMemo, useRef, useState } from 'react'

/** Destinations shown from afar (the places a day in town is organised around). */
const MAJOR: ReadonlySet<LotType> = new Set([
  'market',
  'hospital',
  'station',
  'townhall',
  'cooperative',
  'sport',
  'university',
  'stadium',
  'port',
])
/** Map pixels per cell at zoom 1 (the whole town fits a phone in portrait). */
const PX = 8
/** Minimum distance between two markers on screen (px). */
const GAP = 40

type Run = { x: number; y: number; w: number }

/** Horizontal runs of cells matching `test` (a few hundred rects for the whole town). */
function runs(test: (x: number, y: number) => boolean): Run[] {
  const out: Run[] = []
  for (let y = 0; y < WORLD_H; y++) {
    let start = -1
    for (let x = 0; x <= WORLD_W; x++) {
      const on = x < WORLD_W && test(x, y)
      if (on && start < 0) start = x
      if (!on && start >= 0) {
        out.push({ x: start, y, w: x - start })
        start = -1
      }
    }
  }
  return out
}

export default function CityMap({
  locality,
  filter,
  showNames,
  selectedLot,
  player,
  onLot,
}: {
  /** Town on screen (the map is rebuilt for each town). */
  locality: string
  filter: Category | 'all'
  showNames: boolean
  selectedLot: Lot | null
  player: { x: number; y: number }
  onLot: (lot: Lot) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 400, h: 800 })
  // View: zoom factor and the cell at the centre of the screen.
  const [view, setView] = useState({ k: 1.15, cx: player.x, cy: player.y })
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null)
  const pinch = useRef<{ d: number; k: number } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: the world functions read the locality
  const ground = useMemo(
    () => ({
      water: runs((x, y) => {
        const t = terrainAt(x, y)
        return t === 'lagoon' || t === 'ocean'
      }),
      sand: runs((x, y) => terrainAt(x, y) === 'sand'),
      hill: runs((x, y) => terrainAt(x, y) === 'hill'),
      roads: runs((x, y) => isCityRoad(x, y)),
      estate: runs((x, y) => inEstate(x, y)),
      districts: districts(),
      places: landmarks(),
    }),
    [locality],
  )

  const s = PX * view.k
  const toScreen = (x: number, y: number) => ({
    x: (x - view.cx) * s + size.w / 2,
    y: (y - view.cy) * s + size.h / 2,
  })

  // Markers by priority: selected, major destinations, then the rest; placed without overlap.
  const markers = useMemo(() => {
    const visible = ground.places.filter((l) => filter === 'all' || CATEGORY_OF[l.type] === filter)
    const wanted = visible.filter((l) => view.k >= 2.2 || MAJOR.has(l.type) || filter !== 'all')
    if (selectedLot && !wanted.some((l) => l.id === selectedLot.id)) wanted.push(selectedLot)
    const rank = (l: Lot) => (l.id === selectedLot?.id ? 0 : MAJOR.has(l.type) ? 1 : 2)
    wanted.sort((a, b) => rank(a) - rank(b))
    const placed: { lot: Lot; x: number; y: number }[] = []
    for (const lot of wanted) {
      const p = {
        x: (lot.x + lot.w / 2 - view.cx) * s + size.w / 2,
        y: (lot.y + lot.h / 2 - view.cy) * s + size.h / 2,
      }
      // Only places whose spot is on screen: a marker cut in half by the edge is not usable.
      if (p.x < 0 || p.y < 0 || p.x > size.w || p.y > size.h) continue
      if (lot.id !== selectedLot?.id && placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < GAP))
        continue
      placed.push({ lot, ...p })
    }
    return placed
  }, [ground.places, filter, view, size, selectedLot, s])

  const zoomBy = (f: number) => setView((v) => ({ ...v, k: Math.max(0.7, Math.min(8, v.k * f)) }))

  const me = toScreen(player.x, player.y)
  const namesShown = showNames || view.k >= 4

  return (
    <div
      ref={box}
      className="absolute inset-0 touch-none select-none overflow-hidden bg-[#c6d9bd]"
      data-testid="city-map"
      onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
      onPointerDown={(e) => {
        // A place or a button: let its click through (no pan, no pointer capture).
        if ((e.target as HTMLElement).closest('button')) return
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        try {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        } catch {
          /* a pointer the browser no longer tracks: the gesture still works without capture */
        }
        if (pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()]
          pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k }
          drag.current = null
        } else drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false }
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (pinch.current && pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          const k = Math.max(0.7, Math.min(8, (pinch.current.k * d) / pinch.current.d))
          setView((v) => ({ ...v, k }))
          return
        }
        const g = drag.current
        if (!g) return
        const dx = e.clientX - g.x
        const dy = e.clientY - g.y
        if (Math.hypot(dx, dy) > 6) g.moved = true
        setView((v) => ({ ...v, cx: g.cx - dx / s, cy: g.cy - dy / s }))
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId)
        if (pointers.current.size < 2) pinch.current = null
        drag.current = null
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId)
        pinch.current = null
        drag.current = null
      }}
    >
      <svg
        width={size.w}
        height={size.h}
        className="absolute inset-0"
        role="img"
        aria-label="Carte de la ville par quartiers"
      >
        <g
          transform={`translate(${size.w / 2 - view.cx * s} ${size.h / 2 - view.cy * s}) scale(${s})`}
        >
          {ground.districts.map((d, i) => (
            <rect
              key={d.id}
              x={d.x0}
              y={d.y0}
              width={d.x1 - d.x0}
              height={d.y1 - d.y0}
              fill={i % 2 ? '#d2e0c2' : '#c9d9b6'}
            />
          ))}
          {ground.hill.map((r) => (
            <rect key={`h${r.x}:${r.y}`} x={r.x} y={r.y} width={r.w} height={1.02} fill="#b5c79a" />
          ))}
          {ground.sand.map((r) => (
            <rect key={`s${r.x}:${r.y}`} x={r.x} y={r.y} width={r.w} height={1.02} fill="#ead9a8" />
          ))}
          {ground.water.map((r) => (
            <rect key={`w${r.x}:${r.y}`} x={r.x} y={r.y} width={r.w} height={1.02} fill="#86bccb" />
          ))}
          {ground.estate.map((r) => (
            <rect key={`e${r.x}:${r.y}`} x={r.x} y={r.y} width={r.w} height={1.02} fill="#e3d9b8" />
          ))}
          {ground.roads.map((r) => (
            <rect
              key={`r${r.x}:${r.y}`}
              x={r.x}
              y={r.y}
              width={r.w}
              height={1.02}
              fill="#f7f8f1"
              opacity={0.92}
            />
          ))}
          {ground.districts.map((d) => (
            <rect
              key={`b${d.id}`}
              x={d.x0}
              y={d.y0}
              width={d.x1 - d.x0}
              height={d.y1 - d.y0}
              fill="none"
              stroke="#74817a"
              strokeOpacity={0.35}
              strokeWidth={0.18}
            />
          ))}
        </g>
      </svg>
      {/* District names: always, far; they fade when the places take over. */}
      {ground.districts.map((d) => {
        const p = toScreen((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2)
        if (p.x < -80 || p.y < -20 || p.x > size.w + 80 || p.y > size.h + 20) return null
        return (
          <span
            key={`n${d.id}`}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-black uppercase tracking-wide text-[#253834]"
            style={{ left: p.x, top: p.y, opacity: view.k >= 3 ? 0.35 : 0.8 }}
          >
            {d.name}
          </span>
        )
      })}
      {ground.estate.length > 0 &&
        (() => {
          const xs = ground.estate.map((r) => r.x)
          const ys = ground.estate.map((r) => r.y)
          const p = toScreen(
            (Math.min(...xs) + Math.max(...ground.estate.map((r) => r.x + r.w))) / 2,
            (Math.min(...ys) + Math.max(...ys) + 1) / 2,
          )
          return (
            <span
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#f7f8f1]/85 px-2 py-0.5 text-xs font-bold text-[#195f51]"
              style={{ left: p.x, top: p.y + 22 }}
            >
              Mon domaine
            </span>
          )
        })()}
      {markers.map(({ lot, x, y }) => {
        const selected = lot.id === selectedLot?.id
        return (
          <button
            key={lot.id}
            type="button"
            data-place={lot.id}
            title={lot.name ?? undefined}
            aria-label={lot.name ?? undefined}
            onClick={(e) => {
              e.stopPropagation()
              onLot(lot)
            }}
            className={`absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border-2 px-2 text-base shadow-md ${
              selected
                ? 'border-[#218b70] bg-[#218b70] text-white'
                : 'border-white bg-[#f7f8f1] text-[#253834]'
            }`}
            style={{ left: x, top: y, zIndex: selected ? 3 : 2 }}
          >
            <span aria-hidden>{TYPE_ICONS[lot.type]}</span>
            {(selected || namesShown) && (
              <span className="max-w-36 truncate text-xs font-bold">{lot.name}</span>
            )}
          </button>
        )
      })}
      <span
        className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-[#195f51] px-2 py-1 text-xs font-bold text-white shadow"
        style={{ left: me.x, top: me.y, zIndex: 4 }}
        data-testid="map-me"
      >
        ● Vous
      </span>
      <div
        className="pointer-events-auto absolute bottom-28 right-3 flex flex-col gap-2"
        style={{ zIndex: 5 }}
      >
        <button
          type="button"
          aria-label="Zoom avant sur la carte"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f7f8f1] text-lg font-bold text-[#253834] shadow"
          onClick={() => zoomBy(1.4)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom arrière sur la carte"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f7f8f1] text-lg font-bold text-[#253834] shadow"
          onClick={() => zoomBy(1 / 1.4)}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Centrer la carte sur moi"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f7f8f1] text-sm text-[#253834] shadow"
          onClick={() => setView((v) => ({ ...v, cx: player.x, cy: player.y }))}
        >
          ◎
        </button>
      </div>
    </div>
  )
}
