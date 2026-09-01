'use client'

interface RegionDef {
  name: string
  prefectures: string[]
  x: number
  y: number
  w: number
  h: number
}

const REGIONS: RegionDef[] = [
  { name: 'Savanes', prefectures: ['Dapaong','Tone','Kpendjal','Oti'], x: 50, y: 10, w: 200, h: 80 },
  { name: 'Kara', prefectures: ['Kara','Kozah','Binah','Dankpen','Doufelgou','Keran'], x: 50, y: 95, w: 200, h: 80 },
  { name: 'Centrale', prefectures: ['Sokodé','Tchaoudjo','Tchamba','Sotouboua','Blitta'], x: 50, y: 180, w: 200, h: 80 },
  { name: 'Plateaux', prefectures: ['Atakpamé','Ogou','Haho','Kloto','Wawa','Amou','Agou'], x: 50, y: 265, w: 200, h: 100 },
  { name: 'Maritime', prefectures: ['Lomé','Golfe','Lacs','Vo','Yoto','Zio','Ave'], x: 50, y: 370, w: 200, h: 80 },
]

function prefectureToRegion(prefecture: string): string {
  for (const r of REGIONS) {
    if (r.prefectures.some(p => prefecture.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(prefecture.toLowerCase()))) {
      return r.name
    }
  }
  return ''
}

function intensityToColor(value: number, max: number): string {
  if (max === 0 || value === 0) return '#f0fdf4'
  const ratio = Math.min(value / max, 1)
  const lightness = Math.round(95 - ratio * 60)
  return `hsl(142, 70%, ${lightness}%)`
}

interface TogoMapProps {
  data: Array<{ prefecture: string; value: number }>
  max: number
  metric: string
  onRegionClick: (region: string) => void
  selectedRegion?: string
}

export function TogoMap({ data, max, metric, onRegionClick, selectedRegion }: TogoMapProps) {
  const regionValues: Record<string, number> = {}
  for (const d of data) {
    const region = prefectureToRegion(d.prefecture)
    if (region) regionValues[region] = (regionValues[region] ?? 0) + d.value
  }

  return (
    <div className="relative">
      <svg viewBox="0 0 300 460" width="100%" className="max-w-xs mx-auto">
        {REGIONS.map(r => {
          const val = regionValues[r.name] ?? 0
          const fill = intensityToColor(val, max)
          const isSelected = selectedRegion === r.name
          return (
            <g key={r.name} onClick={() => onRegionClick(r.name)} className="cursor-pointer">
              <rect
                x={r.x} y={r.y} width={r.w} height={r.h}
                fill={fill}
                stroke={isSelected ? '#166534' : '#86efac'}
                strokeWidth={isSelected ? 2.5 : 1}
                rx={4}
              />
              <text x={r.x + r.w / 2} y={r.y + r.h / 2 - 8} textAnchor="middle" fontSize={11} fontWeight="600" fill="#14532d">
                {r.name}
              </text>
              <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 8} textAnchor="middle" fontSize={10} fill="#166534">
                {val > 0 ? val : '—'} {val > 0 ? metric : ''}
              </text>
            </g>
          )
        })}
        <text x="150" y="450" textAnchor="middle" fontSize={9} fill="#6b7280">Golfe du Bénin</text>
      </svg>
      {/* Legend */}
      <div className="flex items-center gap-2 justify-center mt-2 text-xs text-muted-foreground">
        <span>0</span>
        <div className="flex h-3">
          {[0.1, 0.3, 0.5, 0.7, 0.9].map(r => (
            <div key={r} className="w-6 h-3" style={{ background: intensityToColor(r * max, max) }} />
          ))}
        </div>
        <span>{max}</span>
      </div>
    </div>
  )
}
