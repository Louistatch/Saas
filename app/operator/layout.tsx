import { SupportButton } from '@/components/support/support-button'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

// L'espace opérateur s'installe comme une application à part (« Validation ») sur le téléphone.
export const metadata: Metadata = {
  manifest: '/operator.webmanifest',
  appleWebApp: { capable: true, title: 'Validation', statusBarStyle: 'default' },
}

export const viewport: Viewport = { themeColor: '#0d3d22' }

export default function OperatorLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SupportButton />
    </>
  )
}
