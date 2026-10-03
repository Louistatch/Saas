'use client'

/**
 * AgriSmart en accès public : le bilan global des besoins en eau (FAO-56) est
 * libre. Le résultat détaillé et le rapport PDF sont réservés aux agronomes ;
 * l'inscription est proposée juste sous le bilan (AgronomeResultsGate).
 */

import {
  AgriSmartReport,
  AgronomeResultsGate,
  useIsAgronome,
} from '@/components/agrismart/agrismart-report'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { AgriSmartWater } from '@/components/verify/agrismart-water'
import { vfpStyles } from '@/components/verify/vfp-styles'
import { useRouter } from 'next/navigation'

export default function AgriSmartPage() {
  const router = useRouter()
  const access = useIsAgronome()
  return (
    <MarketingLayout>
      <style>{vfpStyles}</style>
      <section className="vfp-bg relative min-h-[70vh] px-4 py-6">
        <div className="relative mx-auto max-w-lg">
          <h1 className="mb-1 text-xl font-bold text-white">AgriSmart — besoins en eau</h1>
          <p className="mb-4 text-sm text-white/60">
            Bilan gratuit et sans compte. Le résultat détaillé et le rapport PDF sont réservés aux
            agronomes inscrits.
          </p>
          <AgriSmartWater
            onBack={() => router.push('/')}
            renderReport={(result, { region }) => (
              <AgriSmartReport result={result} region={region} />
            )}
            // Décision du SERVEUR : il ne renvoie le détail qu'à un agronome validé.
            renderDetailsGate={(result) =>
              result.details_locked ? (
                <AgronomeResultsGate signedIn={access.signedIn} agronome={access.agronome} />
              ) : null
            }
          />
        </div>
      </section>
    </MarketingLayout>
  )
}
