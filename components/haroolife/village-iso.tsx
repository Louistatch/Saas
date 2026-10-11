'use client'

/**
 * Le village du canton, vu en isométrie, dessiné en SVG (aucun modèle à télécharger).
 * Chaque bâtiment est un lieu réel de la plateforme ; chaque personnage est un habitant réel
 * (compte ayant choisi ce canton), placé près du lieu de son rôle, avec son nom et sa dernière
 * parole. Il pleut quand la prévision du jour le dit. Mon personnage marche vers le lieu touché.
 */
import {
  type Message,
  PLACES,
  type PlaceKey,
  type Resident,
  type SkyDay,
  anchorFor,
  initials,
} from '@/lib/haroolife/world'
import { PAGNES } from './pagnes'
import { Hut, Palm, Tree } from './village-scene'

const ORIGIN = { x: 410, y: 150 }
const T = { w: 32, h: 16 } // demi-largeur et demi-hauteur d'une tuile
export const iso = (i: number, j: number) => ({
  x: ORIGIN.x + (i - j) * T.w,
  y: ORIGIN.y + (i + j) * T.h,
})
const tile = (i: number, j: number) => {
  const { x, y } = iso(i, j)
  return `${x},${y - T.h} ${x + T.w},${y} ${x},${y + T.h} ${x - T.w},${y}`
}

/** Où se tient chaque lieu (coordonnées de tuiles) et son étiquette. */
const SPOTS: Record<PlaceKey, { i: number; j: number; icon: string }> = {
  champs: { i: 1.5, j: 1.5, icon: '🌾' },
  cooperative: { i: 8, j: 1, icon: '🏛️' },
  marche: { i: 9, j: 4.5, icon: '🛒' },
  place: { i: 5, j: 5, icon: '🌳' },
  equipes: { i: 1.5, j: 8, icon: '🏠' },
  ecole: { i: 9.5, j: 8, icon: '🎓' },
  bureau: { i: 6, j: 9.5, icon: '🪪' },
}
/** Positions de repos autour d'un lieu, pour que les habitants ne se chevauchent pas. */
const RING = [
  [0, 0],
  [36, 10],
  [-36, 12],
  [14, 28],
  [-16, 30],
  [44, -14],
  [-46, -12],
  [0, 42],
  [60, 20],
  [-60, 22],
]

function Box({
  i,
  j,
  w = 2,
  d = 2,
  h = 40,
  color,
  roof,
}: {
  i: number
  j: number
  w?: number
  d?: number
  h?: number
  color: string
  roof?: string
}) {
  const a = iso(i, j)
  const b = iso(i + w, j)
  const c = iso(i + w, j + d)
  const e = iso(i, j + d)
  const up = (p: { x: number; y: number }) => `${p.x},${p.y - h}`
  return (
    <g>
      <polygon
        points={`${e.x},${e.y} ${c.x},${c.y} ${up(c)} ${up(e)}`}
        fill={color}
        opacity="0.78"
      />
      <polygon points={`${c.x},${c.y} ${b.x},${b.y} ${up(b)} ${up(c)}`} fill={color} />
      <polygon
        points={`${up(a)} ${up(b)} ${up(c)} ${up(e)}`}
        fill={roof ?? color}
        style={{ filter: 'brightness(1.18)' }}
      />
    </g>
  )
}

export function Person({
  name,
  pagne,
  me = false,
  bubble,
  onClick,
}: {
  name: string
  pagne: number
  me?: boolean
  bubble?: string | null
  onClick?: () => void
}) {
  const tone = PAGNES[(pagne - 1) % PAGNES.length] ?? PAGNES[0]
  const label = name.length > 14 ? `${name.slice(0, 13)}…` : name
  const chipW = label.length * 6.6 + 16
  const bubbleText = bubble && bubble.length > 30 ? `${bubble.slice(0, 29)}…` : bubble
  const bubbleW = bubbleText ? Math.min(220, bubbleText.length * 6.2 + 18) : 0
  return (
    <g
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${name}${me ? ' (moi)' : ''}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      className={onClick ? 'cursor-pointer outline-none' : undefined}
    >
      <ellipse cx="0" cy="2" rx="11" ry="4" fill="#1F2A44" opacity="0.25" />
      <rect x="-6" y="-16" width="5" height="16" rx="2" fill="#2b2b2b" />
      <rect x="1" y="-16" width="5" height="16" rx="2" fill="#2b2b2b" />
      <rect
        x="-8"
        y="-36"
        width="16"
        height="22"
        rx="4"
        fill={tone}
        style={{ backgroundImage: 'none' }}
      />
      <path d="M-8 -30h16M-8 -24h16" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" />
      <rect x="-12" y="-34" width="4" height="14" rx="2" fill="#6b3f24" />
      <rect x="8" y="-34" width="4" height="14" rx="2" fill="#6b3f24" />
      <circle cx="0" cy="-44" r="8" fill="#6b3f24" />
      <path d="M-8 -46a8 8 0 0 1 16 0z" fill="#1a1a1a" />
      <g transform="translate(0 -62)">
        <rect
          x={-chipW / 2}
          y="-9"
          width={chipW}
          height="18"
          rx="9"
          fill={me ? '#E0B341' : '#2563eb'}
        />
        <text
          textAnchor="middle"
          y="4"
          fontSize="11"
          fontWeight="700"
          fill={me ? '#1F2A44' : '#fff'}
        >
          {label}
        </text>
      </g>
      {bubbleText && (
        <g transform="translate(0 -84)">
          <rect
            x={-bubbleW / 2}
            y="-11"
            width={bubbleW}
            height="22"
            rx="11"
            fill="#fff"
            stroke="#1F2A44"
            strokeOpacity="0.15"
          />
          <path d="M-4 11l4 6 4-6z" fill="#fff" />
          <text textAnchor="middle" y="4" fontSize="10.5" fill="#1F2A44">
            {bubbleText}
          </text>
        </g>
      )}
    </g>
  )
}

export function VillageIso({
  residents,
  messages,
  me,
  myPlace,
  sky,
  marketLine,
  coopName,
  onPlace,
  onResident,
}: {
  residents: Resident[]
  messages: Message[]
  me: { display_name: string; pagne: number } | null
  myPlace: PlaceKey
  sky: SkyDay | undefined
  marketLine: string | null
  coopName: string | null
  onPlace: (place: PlaceKey) => void
  onResident: (resident: Resident) => void
}) {
  const raining = !!sky && sky.precipitation_probability >= 50
  // Dernière parole de chaque habitant, pendant dix minutes.
  const recent = new Map<string, string>()
  const limit = Date.now() - 10 * 60_000
  for (const m of [...messages].reverse()) {
    if (new Date(m.created_at).getTime() >= limit && !recent.has(m.display_name))
      recent.set(m.display_name, m.body)
  }
  const others = residents.filter((r) => !r.is_me)
  const byPlace = new Map<PlaceKey, number>()
  const placed = others.map((r) => {
    const key = anchorFor(r.roles)
    const n = byPlace.get(key) ?? 0
    byPlace.set(key, n + 1)
    const spot = SPOTS[key]
    const base = iso(spot.i, spot.j)
    const [dx, dy] = RING[(n + 1) % RING.length]
    return { r, x: base.x + dx, y: base.y + dy + 18 }
  })
  const mine = iso(SPOTS[myPlace].i, SPOTS[myPlace].j)
  const tiles: { i: number; j: number }[] = []
  for (let i = 0; i < 11; i++) for (let j = 0; j < 11; j++) tiles.push({ i, j })
  const counts = (key: PlaceKey) => byPlace.get(key) ?? 0

  return (
    <svg viewBox="40 60 740 450" className="h-auto w-full" aria-label="Le village du canton">
      <title>Le village : touchez un lieu pour y aller, un habitant pour le saluer</title>
      <defs>
        <linearGradient id="vi-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={raining ? '#9aa7b8' : '#bfe3f7'} />
          <stop offset="1" stopColor={raining ? '#d6dbe3' : '#f4f1e2'} />
        </linearGradient>
        <pattern
          id="vi-rain"
          width="12"
          height="24"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(12)"
        >
          <path d="M6 0v10" stroke="#3B82B9" strokeWidth="1.2" strokeOpacity="0.55" />
        </pattern>
      </defs>
      <rect width="820" height="560" fill="url(#vi-sky)" />
      {raining ? (
        <g fill="#8b97a8">
          <ellipse cx="160" cy="60" rx="70" ry="18" />
          <ellipse cx="600" cy="48" rx="90" ry="20" />
        </g>
      ) : (
        <>
          <circle cx="700" cy="62" r="30" fill="#ffd36b" />
          <circle cx="700" cy="62" r="46" fill="#ffd36b" opacity="0.25" />
        </>
      )}

      {/* Sol en tuiles : champs au nord-ouest, herbe ailleurs, route de latérite en diagonale. */}
      {tiles.map(({ i, j }) => {
        const field = i < 4 && j < 4
        const road = Math.abs(i - j) <= 0.5 || (j === 5 && i >= 4) || (i === 5 && j >= 4)
        const fill = road
          ? '#c98f5a'
          : field
            ? (i + j) % 2
              ? '#c8a34a'
              : '#78a84a'
            : (i + j) % 2
              ? '#7fb06d'
              : '#8cc063'
        return (
          <polygon
            key={`${i}-${j}`}
            points={tile(i, j)}
            fill={fill}
            stroke="#5f9d4a"
            strokeOpacity="0.35"
            strokeWidth="0.6"
          />
        )
      })}

      {/* Bâtiments et végétation (du fond vers l'avant). */}
      <Box i={7} j={0} w={2} d={2} h={54} color="#B5541F" roof="#d9b67c" />
      <Palm x={iso(10, 0).x} y={iso(10, 0).y - 30} />
      <Box i={8.5} j={3.5} w={1} d={1} h={22} color="#E0B341" roof="#fff5d6" />
      <Box i={9.5} j={4.5} w={1} d={1} h={22} color="#3B82B9" roof="#eaf4ff" />
      <Box i={8.5} j={5.5} w={1} d={1} h={22} color="#2F7D4F" roof="#e9f7ee" />
      <Tree x={iso(5, 5).x} y={iso(5, 5).y - 48} s={1.3} />
      <Hut x={iso(0.5, 7.5).x} y={iso(0.5, 7.5).y - 20} scale={0.6} />
      <Hut x={iso(2.5, 8.5).x} y={iso(2.5, 8.5).y - 20} scale={0.7} />
      <Hut x={iso(1, 9.5).x} y={iso(1, 9.5).y - 20} scale={0.55} />
      <Box i={9} j={7.5} w={2} d={1.5} h={38} color="#1F2A44" roof="#c9d2e6" />
      <Box i={5.5} j={9} w={1.5} d={1.5} h={30} color="#0F766E" roof="#d7f3ef" />
      <Tree x={iso(10, 10).x} y={iso(10, 10).y - 30} s={0.7} />

      {/* Panneau du marché : un vrai prix relevé, ou rien. */}
      {marketLine && (
        <g transform={`translate(${iso(11.6, 4.2).x} ${iso(11.6, 4.2).y - 70})`}>
          <rect x="-70" y="-18" width="140" height="36" rx="4" fill="#1F2A44" />
          <rect x="-2" y="18" width="4" height="26" fill="#1F2A44" />
          <text textAnchor="middle" y="-2" fontSize="10" fill="#E0B341" fontWeight="700">
            PRIX DU JOUR
          </text>
          <text textAnchor="middle" y="12" fontSize="11" fill="#fff">
            {marketLine}
          </text>
        </g>
      )}
      {coopName && (
        <g transform={`translate(${iso(8, 1).x} ${iso(8, 1).y - 70})`}>
          <rect x="-60" y="-10" width="120" height="20" rx="4" fill="#fff" opacity="0.92" />
          <text textAnchor="middle" y="4" fontSize="10" fontWeight="700" fill="#B5541F">
            {coopName.length > 20 ? `${coopName.slice(0, 19)}…` : coopName}
          </text>
        </g>
      )}

      {/* Étiquettes des lieux (comme des marqueurs), touchables. */}
      {(Object.keys(SPOTS) as PlaceKey[]).map((key) => {
        const s = SPOTS[key]
        const p = iso(s.i, s.j)
        const n = counts(key) + (myPlace === key ? 1 : 0)
        return (
          <g
            key={key}
            // biome-ignore lint/a11y/useSemanticElements: marqueur dessiné en SVG
            role="button"
            tabIndex={0}
            aria-label={`${PLACES[key].label}, ${n} personne${n > 1 ? 's' : ''}`}
            onClick={() => onPlace(key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onPlace(key)
              }
            }}
            className="cursor-pointer outline-none"
            transform={`translate(${p.x} ${p.y - 96})`}
          >
            <circle r="17" fill="#fff" stroke="#1F2A44" strokeOpacity="0.15" />
            <text textAnchor="middle" y="6" fontSize="17">
              {s.icon}
            </text>
            {n > 0 && (
              <g transform="translate(14 -12)">
                <circle r="8" fill="#2F7D4F" />
                <text textAnchor="middle" y="3.5" fontSize="9" fontWeight="700" fill="#fff">
                  {n}
                </text>
              </g>
            )}
          </g>
        )
      })}

      {/* Les habitants, puis moi (devant), triés par profondeur. */}
      {placed
        .sort((a, b) => a.y - b.y)
        .map(({ r, x, y }) => (
          <g key={`${r.display_name}-${x}-${y}`} transform={`translate(${x} ${y})`}>
            <Person
              name={r.display_name}
              pagne={r.pagne}
              bubble={recent.get(r.display_name) ?? null}
              onClick={() => onResident(r)}
            />
          </g>
        ))}
      {me && (
        <g
          style={{
            transform: `translate(${mine.x}px, ${mine.y + 18}px)`,
            transition: 'transform 700ms ease-in-out',
          }}
        >
          <Person
            name={me.display_name || initials(me.display_name)}
            pagne={me.pagne}
            me
            bubble={recent.get(me.display_name) ?? null}
          />
        </g>
      )}

      {raining && <rect width="820" height="560" fill="url(#vi-rain)" pointerEvents="none" />}
    </svg>
  )
}
