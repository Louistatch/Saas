import { LomeLifeImmersive } from '@/components/haroolife/lome-life-immersive'
import type { ReactNode } from 'react'

/**
 * One world, one engine. The 3D Lomé Life application is mounted here, in the layout, so
 * every HarooLife address (/haroolife, /territoire, /territoire/lome, /territoire/carte) is
 * a module of the same running world: navigating between them never unmounts PlayCanvas.
 * Pages below only carry their metadata. Nothing here reads cookies or data on the server, so the
 * shell is prerendered and served from the CDN edge instead of a function run per visit.
 */
export default function HarooLifeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <LomeLifeImmersive />
      {children}
    </>
  )
}
