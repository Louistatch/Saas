'use client'

/**
 * Publication d'une annonce sur le marché de proximité, en fenêtre (espace Haroo).
 *
 * Le formulaire est celui de la page /marche/publier (components/market/announcement-form) :
 * il s'adapte à ce que l'on publie (salaire par jour pour une offre de travail, quantité et
 * prix au kilo pour une récolte). L'auteur n'est jamais envoyé par le client : la route le
 * prend de la session.
 */

import { AnnouncementForm } from '@/components/market/announcement-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { AnnouncementType } from '@/lib/market/work'
import { Megaphone } from 'lucide-react'
import { useState } from 'react'

export function PublishAnnouncement({
  defaultType = 'prevente',
  defaultPhone,
  defaultCantonId,
  onPublished,
}: {
  defaultType?: AnnouncementType
  defaultPhone?: string | null
  defaultCantonId?: string | null
  onPublished?: () => void
}) {
  const [open, setOpen] = useState(false)
  // Une nouvelle clé à chaque ouverture : le formulaire repart vide, prérempli du profil.
  const [round, setRound] = useState(0)

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setRound((r) => r + 1)
          setOpen(true)
        }}
      >
        <Megaphone className="mr-1.5 h-4 w-4" /> Publier une annonce
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Publier sur le marché de proximité</DialogTitle>
            <DialogDescription>
              Votre annonce passe en tête pour les personnes de votre canton, puis de votre
              préfecture et de votre région. Les réponses arrivent dans « Mon suivi ».
            </DialogDescription>
          </DialogHeader>
          <AnnouncementForm
            key={round}
            defaultType={defaultType}
            defaultPhone={defaultPhone}
            defaultCantonId={defaultCantonId}
            onCancel={() => setOpen(false)}
            onPublished={() => {
              setOpen(false)
              onPublished?.()
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
