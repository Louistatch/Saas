import { MarketPrice, type LocationOption, type MarketPriceRow } from './models'

export interface SubmitPricePayload {
  cardNumber: string
  cultureId: string
  regionId: string
  marketName: string
  price: number
}

export interface SubmitPriceResult {
  ok: boolean
  message: string
}

/**
 * Encapsulates all "Prix du marché" API calls behind a small typed surface,
 * including request cancellation. Instantiate once per component and call
 * `dispose()` on unmount to abort any in-flight requests.
 */
export class MarketPricesService {
  private controllers = new Set<AbortController>()

  private async getJson<T>(url: string): Promise<T | null> {
    const controller = new AbortController()
    this.controllers.add(controller)
    try {
      const res = await fetch(url, { signal: controller.signal })
      return (await res.json()) as T
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return null
      throw e
    } finally {
      this.controllers.delete(controller)
    }
  }

  async getRegionCounts(): Promise<Record<string, number>> {
    const data = await this.getJson<{ regionCounts?: Record<string, number> }>(
      '/api/market-prices?action=regions',
    )
    return data?.regionCounts ?? {}
  }

  async getPrefectures(regionId: string): Promise<LocationOption[]> {
    const data = await this.getJson<{ prefectures?: LocationOption[] }>(
      `/api/market-prices?action=prefectures&region_id=${regionId}`,
    )
    return data?.prefectures ?? []
  }

  async getCantons(prefectureId: string): Promise<LocationOption[]> {
    const data = await this.getJson<{ cantons?: LocationOption[] }>(
      `/api/market-prices?action=cantons&prefecture_id=${prefectureId}`,
    )
    return data?.cantons ?? []
  }

  async getPrices(regionId: string, cantonId?: string): Promise<MarketPrice[]> {
    let url = `/api/market-prices?region_id=${regionId}`
    if (cantonId) url += `&canton_id=${cantonId}`
    const data = await this.getJson<{ prices?: MarketPriceRow[] }>(url)
    return MarketPrice.fromRows(data?.prices ?? [])
  }

  async submitPrice(payload: SubmitPricePayload): Promise<SubmitPriceResult> {
    try {
      const res = await fetch('/api/market-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_number: payload.cardNumber,
          culture_id: payload.cultureId,
          region_id: payload.regionId,
          market_name: payload.marketName,
          price: payload.price,
        }),
      })
      const data = await res.json()
      if (res.ok) return { ok: true, message: data.message ?? 'Prix enregistré !' }
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
