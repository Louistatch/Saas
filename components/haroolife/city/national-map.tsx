'use client'

/**
 * The Togo of the game, drawn from sourced boundaries only: regions and préfectures from
 * geoBoundaries (built from OpenStreetMap, ODbL), poles at the centroid of their
 * préfecture. No typed-in coordinate, no fake GPS. SVG, so it costs nothing to the WebGL
 * world underneath; the travel itself happens in the 3D engine.
 */
import { LOCALITIES, LOCALITY_IDS, type LocalityId } from '@/lib/haroolife/city/locality'
import boundaries from '@/lib/haroolife/togo/boundaries.json'

type Ring = [number, number][]
interface Shape {
  name: string
  centroid: [number, number]
  rings: Ring[]
  region?: string | null
}
export const data = boundaries as unknown as {
  source: { attribution: string; license: string; boundaryYear: string }
  country: Shape & { bbox: [number, number, number, number] }
  regions: Shape[]
  prefectures: Shape[]
}

const [minX, minY, maxX, maxY] = data.country.bbox
const PAD = 0.12
export const W = 240
export const H = 440
// Equirectangular with the latitude scale of the country's middle: a map, not a survey.
const kx = Math.cos((((minY + maxY) / 2) * Math.PI) / 180)
const sx = (W - 2 * PAD * W) / ((maxX - minX) * kx)
const sy = (H - 2 * PAD * H) / (maxY - minY)
const scale = Math.min(sx, sy)
const ox = (W - (maxX - minX) * kx * scale) / 2
const oy = (H - (maxY - minY) * scale) / 2
export const px = (lon: number) => ox + (lon - minX) * kx * scale
export const py = (lat: number) => oy + (maxY - lat) * scale
export const path = (rings: Ring[]) =>
  rings
    .map((r) => `M${r.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join('L')}Z`)
    .join(' ')

export const REGION_FILL: Record<string, string> = {
  'Savanes Region': '#e9d9a6',
  'Kara Region': '#d9cf8f',
  'Centrale Region': '#cfd79a',
  'Plateaux Region': '#b9d19a',
  'Maritime Region': '#a9d3b8',
}
const REGION_LABEL: Record<string, string> = {
  'Savanes Region': 'Savanes',
  'Kara Region': 'Kara',
  'Centrale Region': 'Centrale',
  'Plateaux Region': 'Plateaux',
  'Maritime Region': 'Maritime',
}

/** Where a locality sits on the map: the centroid of its préfecture in the sourced data. */
export function poleOf(id: LocalityId): { lon: number; lat: number; prefecture: string } | null {
  const pref = data.prefectures.find((p) => p.name === LOCALITIES[id].geo.prefecture)
  return pref ? { lon: pref.centroid[0], lat: pref.centroid[1], prefecture: pref.name } : null
}
export const ATTRIBUTION = `${data.source.attribution} · ${data.source.license}`

export default function NationalMap({
  current,
  onPick,
}: {
  current: LocalityId
  onPick: (id: LocalityId) => void
}) {
  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby="togo-map-title"
        className="mx-auto block h-auto w-full max-w-[260px]"
      >
        <title id="togo-map-title">Carte du Togo : cinq régions, les pôles jouables</title>
        {data.regions.map((r) => (
          <path
            key={r.name}
            d={path(r.rings)}
            fill={REGION_FILL[r.name] ?? '#ddd'}
            stroke="#ffffff"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        ))}
        {data.prefectures.map((p) => (
          <path
            key={p.name}
            d={path(p.rings)}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.55}
            strokeWidth={0.5}
          />
        ))}
        <path d={path(data.country.rings)} fill="none" stroke="#1f2a44" strokeWidth={1} />
        {data.regions.map((r) => (
          <text
            key={`t-${r.name}`}
            x={px(r.centroid[0])}
            y={py(r.centroid[1])}
            textAnchor="middle"
            fontSize={9}
            fontWeight={700}
            fill="#1f2a44"
            fillOpacity={0.55}
          >
            {REGION_LABEL[r.name] ?? r.name}
          </text>
        ))}
        {LOCALITY_IDS.map((id) => {
          const pole = poleOf(id)
          if (!pole) return null
          const here = id === current
          return (
            // biome-ignore lint/a11y/useSemanticElements: an SVG group is the only clickable element inside the map
            <g
              key={id}
              role="button"
              tabIndex={0}
              aria-label={
                here
                  ? `${LOCALITIES[id].name}, vous êtes ici`
                  : `Voyager vers ${LOCALITIES[id].name}`
              }
              aria-pressed={here}
              onClick={() => onPick(id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onPick(id)
                }
              }}
              className="cursor-pointer focus:outline-none"
            >
              <circle
                cx={px(pole.lon)}
                cy={py(pole.lat)}
                r={here ? 7 : 5.5}
                fill={here ? '#047857' : '#ffffff'}
                stroke={here ? '#ffffff' : '#047857'}
                strokeWidth={2}
              />
              <text
                x={px(pole.lon) + 10}
                y={py(pole.lat) + 4}
                fontSize={11}
                fontWeight={800}
                fill="#1f2a44"
                stroke="#ffffff"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {LOCALITIES[id].name}
              </text>
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-1 text-center text-[10px] text-slate-500">
        Limites : {ATTRIBUTION} ({data.source.boundaryYear}). Pôles placés au centre de leur
        préfecture.
      </figcaption>
    </figure>
  )
}
