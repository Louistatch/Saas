import { Announcement, type AnnouncementRow, type AnnouncementType } from './models'

export interface CreateAnnouncementPayload {
  type: AnnouncementType
  title: string
  description?: string
  culture?: string
  quantityKg?: number
  pricePerKgFcfa?: number
  locationCanton?: string
  contactPhone?: string
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

  async list(): Promise<Announcement[]> {
    const controller = new AbortController()
    this.controllers.add(controller)
    try {
      const res = await fetch(`/api/verify/${encodeURIComponent(this.cardNumber)}/announcements`, {
        signal: controller.signal,
      })
      if (!res.ok) return []
      const data = (await res.json()) as { announcements?: AnnouncementRow[] }
      return Announcement.fromRows(data.announcements ?? [])
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return []
      return []
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
          location_canton: payload.locationCanton,
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

  /** Aborts all in-flight requests issued by this service instance. */
  dispose(): void {
    for (const controller of this.controllers) controller.abort()
    this.controllers.clear()
  }
}
