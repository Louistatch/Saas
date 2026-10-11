import type { Metadata } from 'next'
import { LomeLife } from '@/components/haroolife/lome-life'
export const metadata: Metadata = {
  title: 'Lomé Life 3D — HarooLife',
  description: 'Simulation 3D fictive de vie quotidienne à Lomé : déplacement, travail, commerces et construction.',
}
export default function LomeLifePage() { return <LomeLife /> }
