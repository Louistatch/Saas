'use client'

import { PageHeader } from '@/components/shared/page-header'
import { MapPin } from 'lucide-react'

export default function ParcellesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Parcelles"
        description="Gestion des parcelles agricoles des membres"
      />
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="p-4 rounded-full bg-primary/10">
          <MapPin className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Module en cours de développement</h2>
        <p className="text-muted-foreground max-w-md">
          La gestion des parcelles (superficie, culture principale, géolocalisation) sera bientôt disponible.
          Les données collectées via KoboCollect sont déjà enregistrées.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm font-medium">
          🚧 Bientôt disponible
        </div>
      </div>
    </div>
  )
}
