'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, FileText, Sprout } from 'lucide-react'
import type { PublicFiche } from '@/hooks/use-fiches-public'

interface FicheCardProps {
  fiche: PublicFiche
  cultureIcon?: string | null
  onAccess: (fiche: PublicFiche) => void
}

export function FicheCard({ fiche, cultureIcon, onAccess }: FicheCardProps) {
  const coopName = fiche.cooperatives?.name
  const faitiereName = fiche.cooperatives?.faitiere_name

  return (
    <Card className="border-border hover:shadow-md transition-shadow flex flex-col h-full">
      <CardContent className="pt-5 pb-4 flex-1 flex flex-col">
        {/* Header: icon + culture */}
        <div className="flex items-start gap-3 mb-3">
          <div className="text-3xl shrink-0" aria-hidden="true">
            {cultureIcon ?? '🌿'}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-base line-clamp-2">
              {fiche.title}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <Sprout className="h-3 w-3" />
              <span className="truncate">{fiche.culture}</span>
              <span aria-hidden="true">•</span>
              <span className="capitalize truncate">{fiche.type_agriculture}</span>
            </div>
          </div>
        </div>

        {/* Description */}
        {fiche.description ? (
          <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
            {fiche.description}
          </p>
        ) : null}

        {/* Cooperative + campaign */}
        <div className="space-y-1 mb-4 text-xs">
          {coopName ? (
            <p className="text-foreground">
              <span className="text-muted-foreground">Coopérative : </span>
              <span className="font-medium">{coopName}</span>
            </p>
          ) : null}
          {faitiereName ? (
            <p className="text-muted-foreground">Faîtière : {faitiereName}</p>
          ) : null}
          {fiche.campaign ? (
            <p className="text-muted-foreground">Campagne : {fiche.campaign}</p>
          ) : null}
        </div>

        {/* Footer: price + downloads + action */}
        <div className="mt-auto pt-3 border-t border-border">
          <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Download className="h-3 w-3" />
              {fiche.download_count}{' '}
              {fiche.download_count === 1 ? 'téléchargement' : 'téléchargements'}
            </span>
            <span className="font-semibold text-foreground">
              {fiche.price_non_member} FCFA
            </span>
          </div>
          <Button
            className="w-full gap-2 bg-primary hover:bg-primary/90"
            size="sm"
            onClick={() => onAccess(fiche)}
          >
            <FileText className="h-4 w-4" />
            Accéder à la fiche
          </Button>
          <p className="text-[10px] text-center text-muted-foreground mt-2">
            Gratuit pour les membres titulaires d'une carte
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
