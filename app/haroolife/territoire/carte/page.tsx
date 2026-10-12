import { TerritorySandbox } from '@/components/haroolife/territory-sandbox'
import type { Metadata } from 'next'
import 'leaflet/dist/leaflet.css'
export const metadata: Metadata = { title: 'HarooLife — Carte économique du Togo' }
export default function HarooLifeMapPage() {
  return <TerritorySandbox />
}
