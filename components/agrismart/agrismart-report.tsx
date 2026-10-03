'use client'

/**
 * Rapport AgriSmart (PDF) — le calcul est public, le rapport est réservé aux
 * comptes portant un profil Haroo « agronome ». Pour les autres, on dit
 * clairement pourquoi et où aller : pas de bouton muet.
 *
 * Le PDF est produit dans le navigateur à partir du résultat affiché (jsPDF,
 * déjà utilisé pour la météo) : aucune donnée supplémentaire n'est exposée.
 */

import { useAuth } from '@/app/context/auth-context'
import type { CalcResult } from '@/components/verify/agrismart-water'
import { effectiveHarooType } from '@/lib/utils/permissions'
import { FileDown, Loader2, Lock } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

const AGRONOME_SIGNUP = '/auth/signup/haroo?type=AGRONOME'

async function downloadPdf(result: CalcResult, region: string, author: string) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const after = () =>
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  const doc = new jsPDF()
  const date = new Date().toLocaleDateString('fr-FR')
  doc.setFontSize(16)
  doc.text('Rapport AgriSmart — besoins en eau', 14, 18)
  doc.setFontSize(10)
  doc.text(`Établi le ${date} par ${author} (agronome) · FaîtiereHub`, 14, 25)
  doc.text(
    `Région : ${region || 'position GPS'} · Sol : ${result.soil} · Système : ${result.system}`,
    14,
    31,
  )
  doc.text(
    `Climat : ${result.climate_source} · ${result.avg_temp} °C · ${result.total_precip} mm/an`,
    14,
    37,
  )
  const k = result.combined_kpis
  autoTable(doc, {
    startY: 43,
    head: [['Indicateur', 'Valeur']],
    body: [
      ['Surface totale', `${k.total_area_m2.toLocaleString('fr-FR')} m²`],
      ['Besoin année normale', `${Math.round(k.total_survival_m3).toLocaleString('fr-FR')} m³/an`],
      [
        'À prévoir (année sèche, 4 ans sur 5)',
        `${Math.round(k.total_optimal_m3).toLocaleString('fr-FR')} m³/an`,
      ],
      ['Mois de pointe', k.pic_mois],
      ['Débit de pompe recommandé', `${k.debit_pompe_ls.toFixed(2)} L/s (12 h/j)`],
    ],
  })
  autoTable(doc, {
    startY: after(),
    head: [['Mois', 'Normale (m³)', 'Marge sèche (m³)', 'À prévoir (m³)']],
    body: result.combined_monthly
      .filter((m) => m.optimal_total > 0)
      .map((m) => [
        m.mois,
        Math.round(m.volume_total).toLocaleString('fr-FR'),
        Math.round(m.boost_vol_total).toLocaleString('fr-FR'),
        Math.round(m.optimal_total).toLocaleString('fr-FR'),
      ]),
  })
  autoTable(doc, {
    startY: after(),
    head: [['Culture', 'Surface (ha)', 'Repiquage', 'À prévoir (m³)', 'Pointe']],
    body: result.results.map((r) => [
      r.crop,
      (r.area_m2 / 10000).toFixed(2),
      r.planting_month ?? '—',
      Math.round(r.kpis.total_optimal_m3).toLocaleString('fr-FR'),
      r.kpis.pic_mois,
    ]),
  })
  doc.setFontSize(8)
  doc.text(
    'FAO-56 : ETo Penman-Monteith, Kc par stade, bilan hydrique du sol ; pluie efficace USDA SCS ; année sèche = pluie fiable 80 %.',
    14,
    doc.internal.pageSize.getHeight() - 10,
  )
  doc.save(`agrismart-${date.replaceAll('/', '-')}.pdf`)
}

export function AgriSmartReport({ result, region }: { result: CalcResult; region: string }) {
  const { user, isLoading } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (isLoading) return null

  const isAgronome = user ? effectiveHarooType(user.role, user.harooType) === 'agronome' : false

  if (isAgronome && user) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await downloadPdf(result, region, `${user.firstName} ${user.lastName}`.trim())
            } catch {
              setError('Création du PDF impossible. Réessayez.')
            } finally {
              setBusy(false)
            }
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold"
          style={{ background: 'var(--vfp-cta)', color: 'var(--vfp-cta-fg)' }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          Télécharger le rapport (PDF)
        </button>
        {error ? <p className="text-center text-xs text-red-300">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-white">
        <Lock className="h-4 w-4" /> Rapport PDF réservé aux agronomes
      </p>
      <p className="mt-1 text-xs text-white/55">
        {user
          ? 'Le calcul reste libre. Pour télécharger le rapport, votre compte doit porter un profil Haroo « Agronome ».'
          : 'Le calcul est libre. Pour télécharger le rapport, connectez-vous avec un profil agronome ou créez-en un.'}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {user ? (
          <Link
            href="/compte"
            className="rounded-lg border border-white/15 px-3 py-2.5 text-center text-xs font-semibold text-white/85"
          >
            Voir mon compte
          </Link>
        ) : (
          <>
            <Link
              href="/auth/login?redirect=/agrismart"
              className="rounded-lg border border-white/15 px-3 py-2.5 text-center text-xs font-semibold text-white/85"
            >
              Se connecter
            </Link>
            <Link
              href={AGRONOME_SIGNUP}
              className="rounded-lg px-3 py-2.5 text-center text-xs font-semibold"
              style={{ background: 'var(--vfp-cta)', color: 'var(--vfp-cta-fg)' }}
            >
              Créer un profil agronome
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Accès au résultat détaillé de la page publique : le bilan global reste
 * libre ; le détail (mois par mois, par culture, recommandations, PDF) est
 * réservé aux agronomes. Placé juste sous le bilan, là où l'utilisateur
 * cherche la suite de son calcul.
 */
export function AgronomeResultsGate({
  signedIn,
  agronome = false,
}: { signedIn: boolean; agronome?: boolean }) {
  return (
    <div
      className="rounded-2xl border p-4 space-y-3"
      style={{ borderColor: 'var(--vfp-accent)', background: 'rgb(255 255 255 / 0.04)' }}
    >
      <p className="flex items-center gap-2 text-sm font-bold text-white">
        <Lock className="h-4 w-4" /> Voir le résultat complet
      </p>
      <ul className="space-y-1 text-xs text-white/60">
        <li>• Besoins mois par mois sur le cycle de la culture</li>
        <li>• Détail par culture : ETo, Kc, pluie efficace, réserve du sol</li>
        <li>• Recommandations d’arrosage et dimensionnement de la pompe</li>
        <li>• Rapport PDF à remettre au producteur</li>
      </ul>
      {signedIn ? (
        <>
          <p className="text-xs text-white/55">
            {agronome
              ? 'Votre profil agronome est en cours de validation par FaîtiereHub : le résultat complet s’ouvre une fois validé.'
              : 'Ce résultat est réservé aux agronomes validés (profil Haroo « Agronome »).'}
          </p>
          <Link
            href="/compte"
            className="block rounded-xl border border-white/15 py-3 text-center text-sm font-semibold text-white/85"
          >
            Voir mon compte
          </Link>
        </>
      ) : (
        <>
          <Link
            href={AGRONOME_SIGNUP}
            className="block rounded-xl py-3 text-center text-sm font-bold"
            style={{ background: 'var(--vfp-cta)', color: 'var(--vfp-cta-fg)' }}
          >
            S’inscrire comme agronome — gratuit
          </Link>
          <Link
            href="/auth/login?redirect=/agrismart"
            className="block py-1 text-center text-xs font-semibold text-white/70 underline-offset-2 hover:underline"
          >
            J’ai déjà un compte agronome : me connecter
          </Link>
        </>
      )}
    </div>
  )
}

/** true si le compte connecté porte le profil Haroo « agronome ». */
export function useIsAgronome(): { ready: boolean; signedIn: boolean; agronome: boolean } {
  const { user, isLoading } = useAuth()
  return {
    ready: !isLoading,
    signedIn: Boolean(user),
    agronome: user ? effectiveHarooType(user.role, user.harooType) === 'agronome' : false,
  }
}
