import { MarketingLayout } from '@/components/shared/marketing-layout'
import type { Metadata } from 'next'
import SuiviContent from './suivi-content'

export const metadata: Metadata = {
  title: 'Mon suivi — Marché et travail — FaîtiereHub',
  robots: { index: false, follow: false },
}

export default function SuiviPage() {
  return (
    <MarketingLayout>
      <SuiviContent />
    </MarketingLayout>
  )
}
