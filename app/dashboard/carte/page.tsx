'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TogoMap } from '@/components/map/togo-map'
import { useCooperative } from '@/app/context/cooperative-context'
import { X } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'

type Metric = 'members' | 'parcelles' | 'surface_ha'

interface PrefectureRow {
  prefecture: string
  count: number
  value: number
  surface_ha?: number
  cultures?: string[]
}

interface MapData {
  byPrefecture: PrefectureRow[]
  total: number
  max: number
}

const METRIC_LABELS: Record<Metric, string> = {
  members: 'membres',
  parcelles: 'parcelles',
  surface_ha: 'ha',
}

export default function CartePage() {
  const { currentCooperative } = useCooperative()
  const [metric, setMetric] = useState<Metric>('members')
  const [data, setData] = useState<MapData>({ byPrefecture: [], total: 0, max: 0 })
  const [selectedRegion, setSelectedRegion] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!currentCooperative) return
    setLoading(true)
    const res = await fetch(`/api/map/stats?metric=${metric}&cooperative_id=${currentCooperative.id}`)
    if (res.ok) { const d = await res.json(); setData(d) }
    setLoading(false)
  }, [metric, currentCooperative])

  useEffect(() => { void load() }, [load])

  const top5 = [...data.byPrefecture].sort((a, b) => b.value - a.value).slice(0, 5)

  const selectedPrefectures = selectedRegion
    ? data.byPrefecture.filter(p => {
        const REGION_PREFS: Record<string, string[]> = {
          Savanes: ['dapaong','tone','kpendjal','oti'],
          Kara: ['kara','kozah','binah','dankpen','doufelgou','keran'],
          Centrale: ['sokodé','tchaoudjo','tchamba','sotouboua','blitta'],
          Plateaux: ['atakpamé','ogou','haho','kloto','wawa','amou','agou'],
          Maritime: ['lomé','golfe','lacs','vo','yoto','zio','ave'],
        }
        const prefs = REGION_PREFS[selectedRegion] ?? []
        return prefs.some(r => p.prefecture.toLowerCase().includes(r))
      })
    : []

  const selTotal = selectedPrefectures.reduce((s, p) => s + p.count, 0)
  const selSurface = selectedPrefectures.reduce((s, p) => s + (p.surface_ha ?? 0), 0)
  const allCultures = [...new Set(selectedPrefectures.flatMap(p => p.cultures ?? []))]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Carte Agricole"
        description="Répartition géographique des membres et parcelles par préfecture"
      />

      <div className="flex gap-2 flex-wrap">
        {(['members','parcelles','surface_ha'] as Metric[]).map(m => (
          <Button key={m} size="sm" variant={metric === m ? 'default' : 'outline'} onClick={() => setMetric(m)} className="capitalize">
            {m === 'members' ? 'Membres' : m === 'parcelles' ? 'Parcelles' : 'Surface (ha)'}
          </Button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card><CardContent className="pt-4">
            {loading ? <div className="h-64 flex items-center justify-center text-muted-foreground">Chargement...</div> : (
              <TogoMap
                data={data.byPrefecture}
                max={data.max}
                metric={METRIC_LABELS[metric]}
                onRegionClick={r => setSelectedRegion(r === selectedRegion ? undefined : r)}
                selectedRegion={selectedRegion}
              />
            )}
            <div className="text-center text-sm text-muted-foreground mt-2">Total: <strong>{data.total}</strong> {METRIC_LABELS[metric]}</div>
          </CardContent></Card>
        </div>

        <div className="lg:col-span-2">
          {selectedRegion ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{selectedRegion}</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setSelectedRegion(undefined)}><X className="h-4 w-4" /></Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 rounded-lg bg-green-50"><div className="text-xl font-bold text-green-800">{selTotal}</div><div className="text-xs text-green-700">{METRIC_LABELS[metric]}</div></div>
                  <div className="text-center p-3 rounded-lg bg-blue-50"><div className="text-xl font-bold text-blue-800">{selectedPrefectures.length}</div><div className="text-xs text-blue-700">Préfectures</div></div>
                  <div className="text-center p-3 rounded-lg bg-amber-50"><div className="text-xl font-bold text-amber-800">{Math.round(selSurface)}</div><div className="text-xs text-amber-700">ha total</div></div>
                </div>
                {allCultures.length > 0 && (
                  <div><div className="text-sm font-medium mb-2">Cultures</div><div className="flex flex-wrap gap-1">{allCultures.map(c => <Badge key={c} variant="outline">{c}</Badge>)}</div></div>
                )}
                <div><div className="text-sm font-medium mb-2">Par préfecture</div>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b"><th className="text-left py-1 font-medium text-muted-foreground">Préfecture</th><th className="text-right py-1 font-medium text-muted-foreground">{METRIC_LABELS[metric]}</th></tr></thead>
                    <tbody>{selectedPrefectures.map(p => <tr key={p.prefecture} className="border-b"><td className="py-1">{p.prefecture}</td><td className="py-1 text-right font-medium">{p.value}</td></tr>)}</tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader><CardTitle className="text-base">Top 5 préfectures — {METRIC_LABELS[metric]}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {top5.map((p, i) => (
                    <div key={p.prefecture} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-green-100 text-green-800 text-xs font-bold flex items-center justify-center">{i + 1}</div>
                      <div className="flex-1"><div className="text-sm font-medium">{p.prefecture}</div>
                        <div className="h-2 bg-muted rounded-full mt-1"><div className="h-2 bg-green-500 rounded-full" style={{ width: `${data.max > 0 ? (p.value / data.max) * 100 : 0}%` }} /></div>
                      </div>
                      <div className="text-sm font-bold text-green-700">{p.value}</div>
                    </div>
                  ))}
                  {top5.length === 0 && <div className="text-center py-8 text-muted-foreground">Aucune donnée — cliquez sur une région de la carte</div>}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
