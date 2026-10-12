import { LomeLifeImmersive } from '@/components/haroolife/lome-life-immersive'
import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

/**
 * One world, one engine. The 3D Lomé Life application is mounted here, in the layout, so
 * every HarooLife address (/haroolife, /territoire, /territoire/lome, /territoire/carte) is
 * a module of the same running world: navigating between them never unmounts PlayCanvas.
 * Pages below only carry their metadata.
 */
export default function HarooLifeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <LomeLifeImmersive />
      {children}
    </>
  )
}
