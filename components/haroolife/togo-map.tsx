'use client'

// Carte du Togo : cinq régions, du nord (Savanes) au sud (Maritime), tissées dans un motif de
// pagne. Silhouette simplifiée, pas une carte officielle. Les nombres sont les habitants réels
// de HarooLife (comptes ayant choisi leur canton), jamais une estimation.
import type { RegionNode } from '@/lib/haroolife/world'

// Polygones du nord au sud : le pays est large au nord et s'affine vers la côte.
const SHAPES: Record<string, { points: string; label: [number, number] }> = {
  Savanes: { points: '40,10 170,10 168,95 48,95', label: [105, 56] },
  Kara: { points: '48,95 168,95 150,190 55,190', label: [103, 146] },
  Centrale: { points: '55,190 150,190 140,290 70,290', label: [104, 244] },
  Plateaux: { points: '70,290 140,290 130,420 78,420', label: [104, 358] },
  Maritime: { points: '78,420 130,420 128,515 92,515', label: [106, 470] },
}
export const REGION_TONES: Record<string, string> = {
  Savanes: '#E0B341',
  Kara: '#B5541F',
  Centrale: '#2F7D4F',
  Plateaux: '#3B8F5C',
  Maritime: '#3B82B9',
}

export function TogoMap({
  regions,
  selected,
  onSelect,
}: {
  regions: RegionNode[]
  selected: string | null
  onSelect: (regionId: string) => void
}) {
  return (
    <svg
      viewBox="0 0 210 525"
      aria-label="Carte du Togo par région"
      className="mx-auto h-[min(62vh,540px)] w-auto max-w-full"
    >
      <title>Carte du Togo par région</title>
      <defs>
        {Object.entries(REGION_TONES).map(([name, tone]) => (
          <pattern
            key={name}
            id={`pagne-${name}`}
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="10" height="10" fill={tone} opacity="0.16" />
            <rect width="4" height="10" fill={tone} opacity="0.28" />
          </pattern>
        ))}
      </defs>
      {regions.map((r) => {
        const shape = SHAPES[r.name]
        if (!shape) return null
        const tone = REGION_TONES[r.name] ?? '#2F7D4F'
        const active = selected === r.id
        return (
          <g
            key={r.id}
            // biome-ignore lint/a11y/useSemanticElements: un bouton HTML ne peut pas contenir un polygone SVG
            role="button"
            tabIndex={0}
            aria-pressed={active}
            aria-label={`${r.name}, ${r.residents} habitant${r.residents > 1 ? 's' : ''}`}
            onClick={() => onSelect(r.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(r.id)
              }
            }}
            className="cursor-pointer outline-none focus-visible:[&>polygon]:stroke-[#1F2A44] focus-visible:[&>polygon]:stroke-[3]"
          >
            <polygon
              points={shape.points}
              fill={active ? tone : `url(#pagne-${r.name})`}
              stroke={active ? '#1F2A44' : tone}
              strokeWidth={active ? 2.5 : 1.5}
              strokeLinejoin="round"
            />
            <text
              x={shape.label[0]}
              y={shape.label[1] - 6}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill={active ? '#FFFFFF' : '#1F2A44'}
            >
              {r.name}
            </text>
            <text
              x={shape.label[0]}
              y={shape.label[1] + 12}
              textAnchor="middle"
              fontSize="11"
              fill={active ? '#FFFFFF' : '#1F2A44'}
              opacity={active ? 1 : 0.75}
            >
              {r.residents === 0
                ? 'personne encore'
                : `${r.residents} habitant${r.residents > 1 ? 's' : ''}`}
            </text>
          </g>
        )
      })}
      <text x="105" y="521" textAnchor="middle" fontSize="7" fill="#1F2A44" opacity="0.55">
        Golfe de Guinée · silhouette simplifiée
      </text>
    </svg>
  )
}
