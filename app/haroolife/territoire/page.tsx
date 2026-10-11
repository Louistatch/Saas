import { TerritorySandbox } from '@/components/haroolife/territory-sandbox'
import type { Metadata } from 'next'
import 'leaflet/dist/leaflet.css'

export const metadata: Metadata = {
  title: 'HarooLife — Simulation du territoire togolais',
  description: 'Explorez le Togo et testez une chaîne économique fictive entre Kpalimé et Lomé.',
}

export default function HarooLifeTerritoryPage() {
  return (
    <div className="min-h-screen bg-[#f6f7ef]">
      <TerritorySandbox />
    </div>
  )
}
