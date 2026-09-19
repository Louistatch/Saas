'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CheckCircle2, Leaf, Droplets, RefreshCw, Play,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { LoadingBlock } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { errorMessage } from '@/lib/utils/errors'

interface IrrigationResult {
  crop?: string
  monthly?: number[]
  kpis?: { total_m3?: number; peak_month?: string; avg_monthly_mm?: number }
  error?: string
}

interface CalculateResult {
  results?: IrrigationResult[]
  combined?: { total_m3?: number }
  error?: string
}

const CROPS = ['Maïs', 'Riz', 'Manioc', 'Tomate', 'Igname', 'Café', 'Cacao', 'Sorgho', 'Mil', 'Arachide']
const SOILS = ['Argileux', 'Limoneux', 'Sableux', 'Limon sableux', 'Argilo-limoneux']
const SYSTEMS = ['Goutte à goutte', 'Aspersion', 'Gravitaire', 'Micro-aspersion', 'Submersion']

export default function AgrismatAdminPage() {
  const { toast } = useToast()

  // Calculator state
  const [crop, setCrop] = useState('Maïs')
  const [area, setArea] = useState('1000')
  const [soil, setSoil] = useState('Limoneux')
  const [system, setSystem] = useState('Goutte à goutte')
  const [region, setRegion] = useState('Centrale')
  const [calculating, setCalculating] = useState(false)
  const [result, setResult] = useState<CalculateResult | null>(null)

  const calculate = useCallback(async () => {
    setCalculating(true)
    try {
      const res = await fetch('/api/admin/agritogo/agrismart/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crops: [{ name: crop, area_m2: Number(area) }],
          soil_type: soil,
          system,
          region,
        }),
      })
      const data = await res.json() as CalculateResult
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
      setResult(data)
    } catch (e) {
      toast({ title: 'Erreur calcul', description: errorMessage(e), variant: 'destructive' })
    }
    setCalculating(false)
  }, [crop, area, soil, system, region, toast])

  const cropResult = result?.results?.[0]
  // Le maximum servait d'échelle au graphe, mais était recalculé pour chaque
  // barre — un balayage complet par colonne. Calculé une fois ici.
  const monthly = cropResult?.monthly ?? null
  const monthlyMax = monthly ? Math.max(...monthly) : 0
  const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

  return (
    <div className="space-y-8">
      <PageHeader
        title="Agrismat — Expert Irrigation FAO-56"
        description="Calcul des besoins en eau par culture, sol et système d'irrigation"
      />

      {/* Capabilities */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: Leaf, label: '20+ cultures', desc: 'Maïs, riz, manioc, café, cacao…', color: 'bg-green-100 text-green-700' },
          { icon: Droplets, label: '6 types de sol', desc: 'Argileux, limoneux, sableux…', color: 'bg-blue-100 text-blue-700' },
          { icon: CheckCircle2, label: 'FAO-56 certifié', desc: 'Méthode Penman-Monteith internationale', color: 'bg-primary/10 text-primary' },
        ].map((item, i) => {
          const Icon = item.icon
          return (
            <Card key={i} className="border-border">
              <CardContent className="pt-5 flex items-center gap-4">
                <div className={`p-3 rounded-full ${item.color}`}><Icon className="h-6 w-6" /></div>
                <div>
                  <p className="font-semibold text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Calculator */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Droplets className="h-5 w-5 text-primary" /> Calculateur de besoins en eau
          </CardTitle>
          <CardDescription>Utilisé par AgriTogo pour les recommandations aux agriculteurs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Culture</label>
              <select value={crop} onChange={(e) => setCrop(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                {CROPS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Surface (m²)</label>
              <Input type="number" min="1" value={area} onChange={(e) => setArea(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Type de sol</label>
              <select value={soil} onChange={(e) => setSoil(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                {SOILS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Système d&apos;irrigation</label>
              <select value={system} onChange={(e) => setSystem(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                {SYSTEMS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Région (Togo)</label>
              <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Centrale" />
            </div>
          </div>
          <Button onClick={calculate} disabled={calculating} className="gap-2">
            {calculating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Calculer les besoins
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {calculating && <LoadingBlock />}
      {cropResult && !calculating && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Résultats — {cropResult.crop ?? crop}</CardTitle>
            <CardDescription>
              Surface : {area} m² · Sol : {soil} · Système : {system}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {cropResult.kpis && (
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { label: 'Volume total annuel', value: cropResult.kpis.total_m3 !== undefined ? `${cropResult.kpis.total_m3.toFixed(0)} m³` : '—' },
                  { label: 'Mois de pointe', value: cropResult.kpis.peak_month ?? '—' },
                  { label: 'Moyenne mensuelle', value: cropResult.kpis.avg_monthly_mm !== undefined ? `${cropResult.kpis.avg_monthly_mm.toFixed(1)} mm` : '—' },
                ].map((kpi, i) => (
                  <div key={i} className="p-4 rounded-lg border border-border bg-primary/5 text-center">
                    <p className="text-2xl font-bold text-primary">{kpi.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
                  </div>
                ))}
              </div>
            )}

            {monthly && (
              <div>
                <p className="text-sm font-medium text-foreground mb-3">Besoins mensuels (m³)</p>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
                  {monthly.map((val, i) => {
                    const pct = monthlyMax > 0 ? (val / monthlyMax) * 100 : 0
                    return (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <div className="w-full bg-muted rounded-sm overflow-hidden" style={{ height: 60 }}>
                          <div className="w-full bg-primary rounded-sm transition-all" style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{MOIS[i]}</span>
                        <span className="text-xs font-medium text-foreground">{val.toFixed(0)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
