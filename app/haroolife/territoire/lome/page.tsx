import type { Metadata } from 'next'
import { LomeLifeImmersive } from '@/components/haroolife/lome-life-immersive'
export const metadata: Metadata = {
  title: 'Lomé Life 3D — HarooLife',
  description: 'Simulation 3D fictive de vie quotidienne à Lomé : déplacement, travail, commerces et construction.',
}
export default function LomeLifePage() { return <LomeLifeImmersive /> }
