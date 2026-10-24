'use client'

/**
 * Marché de proximité — la liste publique.
 *
 * Ouverte aux visiteurs anonymes, volontairement : sur ce marché, l'acheteur potentiel arrive
 * souvent par un lien partagé, sans compte. Répondre (« Je suis intéressé ») et publier
 * demandent un compte ; le numéro d'une annonce se demande une annonce à la fois.
 */

import { AnnouncementBrowser, type TypeFilter } from '@/components/market/announcement-browser'

const FILTERS: TypeFilter[] = [
  { value: '', label: 'Tout' },
  { value: 'prevente', label: 'Récoltes' },
  { value: 'job', label: 'Travail' },
  { value: 'mission', label: 'Conseil' },
  { value: 'autre', label: 'Services' },
]

export default function MarcheContent() {
  return (
    <AnnouncementBrowser
      filters={FILTERS}
      publishHref="/marche/publier?type=prevente"
      publishLabel="Publier une annonce"
      emptyTitle="Rien ici pour l’instant"
      emptyText="Aucune annonce ne correspond. Élargissez la zone, ou publiez la vôtre : vos voisins la verront en premier."
    />
  )
}
