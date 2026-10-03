'use client'

/**
 * AgriSmart en accès public : calcul des besoins en eau (FAO-56) sans compte.
 * Le rapport PDF, lui, est réservé aux profils agronomes (AgriSmartReport).
 */

import { AgriSmartReport } from '@/components/agrismart/agrismart-report'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { AgriSmartWater } from '@/components/verify/agrismart-water'
import { vfpStyles } from '@/components/verify/vfp-styles'
import { useRouter } from 'next/navigation'

export default function AgriSmartPage() {
  const router = useRouter()
  return (
    <MarketingLayout>
      <style>{vfpStyles}</style>
      <section className="vfp-bg relative min-h-[70vh] px-4 py-6">
        <div className="relative mx-auto max-w-lg">
          <h1 className="mb-1 text-xl font-bold text-white">AgriSmart — besoins en eau</h1>
          <p className="mb-4 text-sm text-white/60">
            Calcul gratuit et sans compte. Le rapport PDF est réservé aux agronomes.
          </p>
          <AgriSmartWater
            onBack={() => router.push('/')}
            renderReport={(result, { region }) => (
              <AgriSmartReport result={result} region={region} />
            )}
          />
        </div>
      </section>
    </MarketingLayout>
  )
}
