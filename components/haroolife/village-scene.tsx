import type { KeyboardEvent } from 'react'

export type Place = 'team' | 'work' | 'all'

type Spot = { key: Place; label: string; count: string; x: number; y: number }

const FIELD_ROWS = [0, 1, 2, 3, 4, 5]

function Hut({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="0" cy="46" rx="42" ry="9" fill="#0f3d2a" opacity="0.18" />
      <path d="M-30 46V6h60v40z" fill="#c98f5a" />
      <path d="M-30 6h60v10h-60z" fill="#b87a47" />
      <path d="M-12 46V24q12-12 24 0v22z" fill="#5a3a22" />
      <path d="M-42 8L0-34 42 8z" fill="#d9a441" />
      <path d="M-42 8L0-34 42 8" fill="none" stroke="#a9772a" strokeWidth="2" />
      <path d="M-26 6L-8-20M-6 6L2-28M14 6L12-24M30 6L20-12" stroke="#a9772a" strokeWidth="1.5" />
    </g>
  )
}

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="40" rx="34" ry="7" fill="#0f3d2a" opacity="0.18" />
      <path d="M-7 40Q-6 8-3-12h6Q6 8 7 40z" fill="#7a5230" />
      <circle cx="0" cy="-22" r="34" fill="#2f7d4f" />
      <circle cx="-22" cy="-8" r="22" fill="#3b8f5c" />
      <circle cx="22" cy="-10" r="24" fill="#2a704a" />
    </g>
  )
}

function Palm({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 40Q6 10 2-24" stroke="#7a5230" strokeWidth="5" fill="none" />
      <path
        d="M2-24Q-22-34-34-18M2-24Q-14-44-30-40M2-24Q20-42 36-32M2-24Q22-22 34-8M2-24Q4-46 14-52"
        stroke="#2f7d4f"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  )
}

export function VillageScene({
  counts,
  onChoose,
}: {
  counts: Record<Place, number>
  onChoose: (place: Place) => void
}) {
  const spots: Spot[] = [
    { key: 'work', label: 'Nos parcelles', count: `${counts.work} ouvert(s)`, x: 190, y: 400 },
    {
      key: 'all',
      label: 'Place du village',
      count: `${counts.all} participation(s)`,
      x: 400,
      y: 340,
    },
    { key: 'team', label: 'Maison des équipes', count: `${counts.team} ouvert(s)`, x: 625, y: 410 },
  ]

  function onKey(event: KeyboardEvent<SVGGElement>, key: Place) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onChoose(key)
    }
  }

  const hotspot =
    'group cursor-pointer outline-none transition-transform duration-200 hover:-translate-y-1 focus-visible:-translate-y-1 motion-reduce:transform-none'
  const ring = 'group-hover:stroke-emerald-900/40 group-focus-visible:stroke-emerald-900'

  return (
    <svg
      viewBox="0 0 800 480"
      aria-label="Village : choisissez un lieu pour agir"
      className="relative mb-6 h-auto w-full rounded-2xl"
    >
      <title>Illustration stylisée d’un village avec des champs, des cases et une place</title>
      <defs>
        <linearGradient id="hl-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fd0f2" />
          <stop offset="1" stopColor="#fdf3d2" />
        </linearGradient>
        <linearGradient id="hl-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8cc063" />
          <stop offset="1" stopColor="#5f9d4a" />
        </linearGradient>
      </defs>

      <rect width="800" height="480" fill="url(#hl-sky)" />
      <circle cx="660" cy="70" r="38" fill="#ffd36b" />
      <circle cx="660" cy="70" r="56" fill="#ffd36b" opacity="0.28" />
      <g fill="#fff" opacity="0.85">
        <ellipse cx="150" cy="70" rx="48" ry="13" />
        <ellipse cx="185" cy="58" rx="30" ry="12" />
        <ellipse cx="430" cy="44" rx="40" ry="11" />
      </g>

      <path d="M0 210Q120 140 250 200T520 190T800 190V480H0z" fill="#7fb06d" />
      <path d="M0 240Q160 190 330 235T620 225T800 240V480H0z" fill="url(#hl-ground)" />

      <Tree x={92} y={198} s={0.7} />
      <Palm x={730} y={200} />
      <Palm x={760} y={214} />
      <Tree x={555} y={210} s={0.6} />

      <path d="M400 235Q392 300 330 480H470Q420 300 408 235z" fill="#d9b67c" opacity="0.8" />

      <g
        className={hotspot}
        // biome-ignore lint/a11y/useSemanticElements: un <button> HTML ne peut pas être inclus dans un SVG
        role="button"
        tabIndex={0}
        aria-label={`Nos parcelles, ${counts.work} groupe(s) ouvert(s)`}
        onClick={() => onChoose('work')}
        onKeyDown={(e) => onKey(e, 'work')}
      >
        <rect
          x="35"
          y="262"
          width="310"
          height="170"
          rx="16"
          className={ring}
          fill="transparent"
          stroke="transparent"
          strokeWidth="3"
        />
        {FIELD_ROWS.map((row) => (
          <path
            key={row}
            d={`M${70 + row * 8} ${290 + row * 17}L${270 + row * 8} ${280 + row * 17}L${288 + row * 8} ${296 + row * 17}L${88 + row * 8} ${306 + row * 17}z`}
            fill={row % 2 ? '#c8a34a' : '#78a84a'}
            stroke="#5d7f3a"
            strokeWidth="1"
          />
        ))}
        <path
          d="M80 300L280 292M92 322L292 314M104 345L304 337"
          stroke="#3f6a2c"
          strokeWidth="2"
          strokeDasharray="4 6"
        />
      </g>

      <g
        className={hotspot}
        // biome-ignore lint/a11y/useSemanticElements: un <button> HTML ne peut pas être inclus dans un SVG
        role="button"
        tabIndex={0}
        aria-label={`Place du village, ${counts.all} participation(s)`}
        onClick={() => onChoose('all')}
        onKeyDown={(e) => onKey(e, 'all')}
      >
        <rect
          x="320"
          y="206"
          width="160"
          height="170"
          rx="16"
          className={ring}
          fill="transparent"
          stroke="transparent"
          strokeWidth="3"
        />
        <ellipse cx="400" cy="318" rx="70" ry="16" fill="#e5c88e" />
        <Tree x={400} y={262} s={1.15} />
        <rect x="350" y="316" width="30" height="7" rx="3" fill="#7a5230" />
        <rect x="420" y="316" width="30" height="7" rx="3" fill="#7a5230" />
      </g>

      <g
        className={hotspot}
        // biome-ignore lint/a11y/useSemanticElements: un <button> HTML ne peut pas être inclus dans un SVG
        role="button"
        tabIndex={0}
        aria-label={`Maison des équipes, ${counts.team} groupe(s) ouvert(s)`}
        onClick={() => onChoose('team')}
        onKeyDown={(e) => onKey(e, 'team')}
      >
        <rect
          x="500"
          y="250"
          width="270"
          height="190"
          rx="16"
          className={ring}
          fill="transparent"
          stroke="transparent"
          strokeWidth="3"
        />
        <Hut x={560} y={318} scale={0.8} />
        <Hut x={690} y={310} scale={0.9} />
        <Hut x={625} y={344} scale={1.1} />
        <g fill="#2a704a">
          <circle cx="598" cy="388" r="5" />
          <circle cx="618" cy="392" r="5" />
          <circle cx="638" cy="388" r="5" />
        </g>
      </g>

      {spots.map((s) => (
        <g key={s.key} pointerEvents="none" transform={`translate(${s.x} ${s.y})`}>
          <rect x="-100" y="12" width="200" height="46" rx="23" fill="#fff" opacity="0.94" />
          <text textAnchor="middle" y="31" fontSize="16" fontWeight="700" fill="#0f3d2a">
            {s.label}
          </text>
          <text textAnchor="middle" y="49" fontSize="13" fill="#475569">
            {s.count}
          </text>
        </g>
      ))}
    </svg>
  )
}
