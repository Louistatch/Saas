'use client'

/**
 * Rendement attendu d'une parcelle (modèle FAO-33 d'AgriTogo), avec sa
 * fourchette, sa source et ses limites — jamais un chiffre nu.
 */

import { Info } from 'lucide-react'
import { useEffect, useState } from 'react'

export interface YieldEstimateView {
  crop: string
  irrigated: boolean
  planting_month: string
  yield_t_ha: { annee_normale: number; annee_seche: number; fourchette: [number, number] }
  water_satisfaction_pct: { annee_normale: number; annee_seche: number }
  production_t?: { annee_normale: number; annee_seche: number }
  method: {
    yref_status: string
    yref_source: string
    ky: number
    validated_locally: boolean
    limits: string[]
  }
}

const t = (x: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

export function YieldPanel({
  estimate,
  observed,
  dark = false,
}: {
  estimate: YieldEstimateView | null | undefined
  observed?: number | null
  dark?: boolean
}) {
  const muted = dark ? 'text-white/45' : 'text-muted-foreground'
  const strong = dark ? 'text-white' : 'text-foreground'
  const box = dark ? 'border-white/10 bg-white/[0.03]' : 'border-border bg-muted/30'
  if (!estimate) {
    return (
      <p className={`text-xs ${muted}`}>
        Rendement attendu : estimation indisponible pour cette culture.
      </p>
    )
  }
  const y = estimate.yield_t_ha
  return (
    <div className={`space-y-1.5 rounded-xl border p-3 ${box}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Rendement attendu</p>
      <p className={`text-sm font-semibold ${strong}`}>
        {t(y.annee_normale)} t/ha <span className={`font-normal ${muted}`}>année normale</span> ·{' '}
        {t(y.annee_seche)} t/ha <span className={`font-normal ${muted}`}>année sèche</span>
      </p>
      <p className={`text-xs ${muted}`}>
        Fourchette {t(y.fourchette[0])} – {t(y.fourchette[1])} t/ha
        {estimate.production_t
          ? ` · soit ≈ ${t(estimate.production_t.annee_normale)} t sur la parcelle`
          : ''}
        {' · '}besoins en eau couverts à {estimate.water_satisfaction_pct.annee_normale} %
        {estimate.irrigated ? ' (irriguée)' : ` (pluviale, semis ${estimate.planting_month})`}
      </p>
      {observed != null ? (
        <p className={`text-xs ${strong}`}>
          Rendement observé (production déclarée) : {t(observed)} t/ha
        </p>
      ) : null}
      <p className={`flex items-start gap-1 text-[11px] ${muted}`}>
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          Estimation FAO-33 (eau) sur rendement moyen national
          {estimate.method.yref_status === 'vérifié' ? ' sourcé' : ' à vérifier'} —{' '}
          {estimate.method.yref_source}. Ne tient pas compte de la fertilité ni des ravageurs.
          {estimate.method.validated_locally ? '' : ' Non encore validée sur des récoltes locales.'}
        </span>
      </p>
    </div>
  )
}

/** Charge l'estimation d'une parcelle du tableau de bord à l'ouverture. */
export function ParcelYield({ parcelId }: { parcelId: string }) {
  const [state, setState] = useState<{
    estimate: YieldEstimateView | null
    observed: number | null
  } | null>(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/parcelles/${parcelId}/yield`)
      .then((r) => (r.ok ? r.json() : { estimate: null, observed_t_ha: null }))
      .then((d) => alive && setState({ estimate: d.estimate, observed: d.observed_t_ha }))
      .catch(() => alive && setState({ estimate: null, observed: null }))
    return () => {
      alive = false
    }
  }, [parcelId])
  if (!state) return <p className="text-xs text-muted-foreground">Calcul du rendement attendu…</p>
  return <YieldPanel estimate={state.estimate} observed={state.observed} />
}
