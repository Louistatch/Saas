import {
  Announcement,
  type AnnouncementDefaults,
  type AnnouncementRow,
  type AnnouncementType,
  EMPTY_DEFAULTS,
  type ListingRow,
} from './models'

export interface CreateAnnouncementPayload {
  type: AnnouncementType
  title: string
  description?: string
  culture?: string
  quantityKg?: number
  pricePerKgFcfa?: number
  /** Seulement quand la fiche membre n'a pas de préfecture : choisie à l'écran. */
  prefectureId?: string
  contactPhone?: string
}

export interface ListAnnouncementsResult {
  announcements: Announcement[]
  listings: ListingRow[]
  defaults: AnnouncementDefaults
}

export interface CreateAnnouncementResult {
  ok: boolean
  message: string
  announcement?: Announcement
}

/**
 * Encapsulates "Mon Exploitation" announcement API calls (job offers,
 * pre-sales, other Haroo-related posts) behind a small typed surface,
 * including request cancellation. Instantiate once per component and
 * call `dispose()` on unmount to abort any in-flight requests.
 */
export class AnnouncementsService {
  private controllers = new Set<AbortController>()

  constructor(private readonly cardNumber: string) {}

  async list(): Promise<ListAnnouncementsResult> {
    const empty: ListAnnouncementsResult = {
      announcements: [],
      listings: [],
      defaults: EMPTY_DEFAULTS,
    }
    const controller = new AbortController()
    this.controllers.add(controller)
    try {
      const res = await fetch(`/api/verify/${encodeURIComponent(this.cardNumber)}/announcements`, {
        signal: controller.signal,
      })
      if (!res.ok) return empty
      const data = (await res.json()) as {
        announcements?: AnnouncementRow[]
        listings?: ListingRow[]
        defaults?: AnnouncementDefaults
      }
      return {
        announcements: Announcement.fromRows(data.announcements ?? []),
        listings: data.listings ?? [],
        defaults: data.defaults ?? EMPTY_DEFAULTS,
      }
    } catch {
      return empty
    } finally {
      this.controllers.delete(controller)
    }
  }

  async create(payload: CreateAnnouncementPayload): Promise<CreateAnnouncementResult> {
    try {
      const res = await fetch(`/api/verify/${encodeURIComponent(this.cardNumber)}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: payload.type,
          title: payload.title,
          description: payload.description,
          culture: payload.culture,
          quantity_kg: payload.quantityKg,
          price_per_kg_fcfa: payload.pricePerKgFcfa,
          prefecture_id: payload.prefectureId,
          contact_phone: payload.contactPhone,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        return {
          ok: true,
          message: data.message ?? 'Annonce publiée !',
          announcement: data.announcement ? new Announcement(data.announcement as AnnouncementRow) : undefined,
        }
      }
      return { ok: false, message: data.error ?? 'Erreur' }
    } catch {
      return { ok: false, message: 'Erreur de connexion' }
    }
  }

  /** Retire une annonce du Marché (statut « closed »), sans l'effacer de l'historique. */
  async close(id: string): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch(
        `/api/verify/${encodeURIComponent(this.cardNumber)}/announcements/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'closed' }),
        },
      )
      if (res.ok) return { ok: true, message: 'Annonce retirée du marché' }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, message: data.error ?? 'Retrait impossible' }
    } catch {
      return { ok: false, message: 'Erreur de connexion' }
    }
  }

  /** Clôt une vente AgriMarket : « sold » (vendue) ou « cancelled » (retirée). */
  async closeListing(
    id: string,
    status: 'sold' | 'cancelled',
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch(
        `/api/verify/${encodeURIComponent(this.cardNumber)}/listings/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      )
      if (res.ok) {
        return { ok: true, message: status === 'sold' ? 'Vente marquée comme vendue' : 'Vente retirée' }
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, message: data.error ?? 'Modification impossible' }
    } catch {
      return { ok: false, message: 'Erreur de connexion' }
    }
  }

  /** Aborts all in-flight requests issued by this service instance. */
  dispose(): void {
    for (const controller of this.controllers) controller.abort()
    this.controllers.clear()
  }
}
