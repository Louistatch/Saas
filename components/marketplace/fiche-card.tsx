'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { PublicFiche } from '@/hooks/use-fiches-public'
import { memberFreeLabel } from '@/lib/fiches/member-label'
import { labelTypeAgriculture, priceLabel, summarizeFiles } from '@/lib/fiches/types'
import { CheckCircle2, Download, FileText, MapPin, Sprout } from 'lucide-react'

interface FicheCardProps {
  fiche: PublicFiche
  cultureIcon?: string | null
  onAccess: (fiche: PublicFiche) => void
  /** Acheté par ce visiteur (compte connecté ou appareil). */
  owned?: boolean
  /** Aperçu dans l'administration : bouton inactif. */
  preview?: boolean
}

export function FicheCard({ fiche, cultureIcon, onAccess, owned, preview }: FicheCardProps) {
  const coopName = fiche.cooperatives?.name
  const faitiereName = fiche.cooperatives?.faitiere_name
  const free = fiche.price_non_member <= 0
  const contents = summarizeFiles(fiche.files_summary)

  return (
    <Card
      className={`border-border hover:shadow-md transition-shadow flex flex-col h-full overflow-hidden ${fiche.cover_url ? 'pt-0 gap-0' : ''}`}
    >
      {fiche.cover_url ? (
        <img
          src={fiche.cover_url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-40 w-full object-cover"
        />
      ) : null}
      <CardContent className="pt-5 pb-4 flex-1 flex flex-col">
        {/* En-tête : icône + culture */}
        <div className="flex items-start gap-3 mb-3">
          <div className="text-3xl shrink-0" aria-hidden="true">
            {cultureIcon ?? '🌿'}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-base line-clamp-2">
              {fiche.title || 'Titre du compte d’exploitation'}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <Sprout className="h-3 w-3 shrink-0" />
              <span className="shrink-0">{fiche.culture || '—'}</span>
              <span aria-hidden="true">•</span>
              <span className="truncate">{labelTypeAgriculture(fiche.type_agriculture)}</span>
            </div>
          </div>
        </div>

        {fiche.description ? (
          <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{fiche.description}</p>
        ) : null}

        {/* Localité — découpage administratif */}
        {fiche.region || fiche.prefecture || fiche.canton ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
            <MapPin className="h-3 w-3 shrink-0 text-primary/70" />
            <span className="truncate">
              {[fiche.region?.name, fiche.prefecture?.name, fiche.canton?.name]
                .filter(Boolean)
                .join(' › ')}
            </span>
          </div>
        ) : null}

        {/* Contenu vendu : format et taille, sans nom de stockage */}
        {contents ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
            <FileText className="h-3 w-3 shrink-0 text-primary/70" />
            <span className="truncate">{contents}</span>
          </div>
        ) : null}

        {/* Vendeur + campagne */}
        <div className="space-y-1 mb-4 text-xs">
          {!fiche.cooperative_id ? (
            <p className="text-foreground">
              <span className="text-muted-foreground">Vendu par : </span>
              <span className="font-medium">FaîtiereHub</span>
            </p>
          ) : null}
          {coopName ? (
            <p className="text-foreground">
              <span className="text-muted-foreground">Coopérative : </span>
              <span className="font-medium">{coopName}</span>
            </p>
          ) : null}
          {faitiereName ? <p className="text-muted-foreground">Faîtière : {faitiereName}</p> : null}
          {fiche.campaign ? (
            <p className="text-muted-foreground">Campagne : {fiche.campaign}</p>
          ) : null}
        </div>

        {/* Pied : prix + téléchargements + action */}
        <div className="mt-auto pt-3 border-t border-border">
          <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Download className="h-3 w-3" />
              {fiche.download_count}{' '}
              {fiche.download_count === 1 ? 'téléchargement' : 'téléchargements'}
            </span>
            {owned ? (
              <Badge className="gap-1 bg-green-600 text-white">
                <CheckCircle2 className="h-3 w-3" /> Acheté
              </Badge>
            ) : (
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {priceLabel(fiche.price_non_member)}
              </span>
            )}
          </div>
          <Button
            className="w-full gap-2"
            variant={owned ? 'outline' : 'default'}
            size="sm"
            onClick={() => onAccess(fiche)}
            disabled={preview}
          >
            {owned ? <Download className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            {owned ? 'Télécharger' : free ? 'Télécharger gratuitement' : 'Acheter'}
          </Button>
          {fiche.is_free_for_members && !free && !owned ? (
            <p className="text-[11px] text-center text-muted-foreground mt-2">
              {memberFreeLabel(fiche)}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
