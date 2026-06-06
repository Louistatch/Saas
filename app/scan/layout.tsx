import type { ReactNode } from 'react'

export const metadata = {
  title: 'CoopScan',
  description: 'Vérification de cartes de membres',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CoopScan',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export default function ScanLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
