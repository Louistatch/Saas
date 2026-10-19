'use client'

// Ma maison : une pièce vue en isométrie, mon personnage, et la porte vers le village.
import { ROLE_LABELS, type Role } from '@/lib/haroolife/world'
import { Person } from './village-iso'

const O = { x: 200, y: 70 }
const W = 7
const S = { w: 24, h: 12 }
const p = (i: number, j: number) => ({ x: O.x + (i - j) * S.w, y: O.y + (i + j) * S.h })
const tile = (i: number, j: number) => {
  const { x, y } = p(i, j)
  return `${x},${y - S.h} ${x + S.w},${y} ${x},${y + S.h} ${x - S.w},${y}`
}

export function HomeRoom({
  name,
  pagne,
  roles,
  canton,
  onLeave,
  onEdit,
}: {
  name: string
  pagne: number
  roles: Role[]
  canton: string
  onLeave: () => void
  onEdit: () => void
}) {
  const tiles: { i: number; j: number }[] = []
  for (let i = 0; i < W; i++) for (let j = 0; j < W; j++) tiles.push({ i, j })
  const wallH = 90
  const left = `${p(0, 0).x},${p(0, 0).y - S.h} ${p(0, W).x - S.w},${p(0, W).y} ${p(0, W).x - S.w},${p(0, W).y - wallH} ${p(0, 0).x},${p(0, 0).y - S.h - wallH}`
  const right = `${p(0, 0).x},${p(0, 0).y - S.h} ${p(W, 0).x + S.w},${p(W, 0).y} ${p(W, 0).x + S.w},${p(W, 0).y - wallH} ${p(0, 0).x},${p(0, 0).y - S.h - wallH}`
  const mat = p(1.5, 4.5)
  const jar = p(5.5, 1)
  const chair = p(4.5, 4.5)
  const meAt = p(3, 2.5)
  return (
    <div className="space-y-4">
      <svg viewBox="0 0 400 300" className="h-auto w-full" aria-label="Ma maison">
        <title>Ma maison, avec mon personnage</title>
        <rect width="400" height="300" fill="#e8efe3" />
        <polygon points={left} fill="#5a6f8c" />
        <polygon points={right} fill="#6d83a1" />
        {/* Fenêtre à gauche, porte à droite. */}
        <polygon
          points={`${p(0, 2).x - S.w + 2},${p(0, 2).y - 62} ${p(0, 4.5).x - S.w + 2},${p(0, 4.5).y - 50} ${p(0, 4.5).x - S.w + 2},${p(0, 4.5).y - 22} ${p(0, 2).x - S.w + 2},${p(0, 2).y - 34}`}
          fill="#cfe6f5"
          stroke="#fff"
        />
        <polygon
          points={`${p(4, 0).x + S.w - 2},${p(4, 0).y - 74} ${p(5.6, 0).x + S.w - 2},${p(5.6, 0).y - 66} ${p(5.6, 0).x + S.w - 2},${p(5.6, 0).y - 2} ${p(4, 0).x + S.w - 2},${p(4, 0).y - 10}`}
          fill="#5a3a22"
        />
        {tiles.map(({ i, j }) => (
          <polygon
            key={`${i}-${j}`}
            points={tile(i, j)}
            fill={(i + j) % 2 ? '#d9c9a6' : '#c9b48c'}
          />
        ))}
        {/* Natte, jarre, chaise, lampe. */}
        <polygon
          points={`${mat.x},${mat.y - 14} ${mat.x + 40},${mat.y + 6} ${mat.x},${mat.y + 26} ${mat.x - 40},${mat.y + 6}`}
          fill="#3B82B9"
          opacity="0.75"
        />
        <ellipse cx={jar.x} cy={jar.y} rx="11" ry="5" fill="#1F2A44" opacity="0.2" />
        <rect x={jar.x - 9} y={jar.y - 26} width="18" height="26" rx="6" fill="#1e3a8a" />
        <rect x={chair.x - 7} y={chair.y - 24} width="14" height="20" rx="2" fill="#c2410c" />
        <rect x={chair.x - 9} y={chair.y - 8} width="18" height="4" fill="#9a3412" />
        <line
          x1={p(0.5, 0.5).x}
          y1={p(0.5, 0.5).y - 100}
          x2={p(0.5, 0.5).x}
          y2={p(0.5, 0.5).y - 70}
          stroke="#333"
        />
        <circle cx={p(0.5, 0.5).x} cy={p(0.5, 0.5).y - 66} r="6" fill="#fff4bf" stroke="#E0B341" />
        <g transform={`translate(${meAt.x} ${meAt.y})`}>
          <Person name={name} pagne={pagne} me />
        </g>
      </svg>
      <div className="space-y-2">
        <p className="text-sm text-[#1F2A44]/70">Ma maison est à {canton}.</p>
        <p className="flex flex-wrap gap-1">
          {roles.map((r) => (
            <span key={r} className="rounded-full bg-[#1F2A44]/10 px-2 py-0.5 text-xs font-medium">
              {ROLE_LABELS[r] ?? r}
            </span>
          ))}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onLeave}
            className="rounded-xl bg-[#2F7D4F] px-4 py-3 font-semibold text-white"
          >
            Sortir au village
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-xl border border-[#1F2A44]/20 px-4 py-3"
          >
            Changer de maison
          </button>
        </div>
      </div>
    </div>
  )
}
