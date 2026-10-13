/**
 * Aggregated, privacy-preserving billboard statistics (D4+, M2). An impression is one support
 * seen continuously for MIN_EXPOSURE_MS (approximation: in front, in range, inside the field of
 * view; no occlusion test), at most once per support and campaign every REPEAT_MS. A click is
 * only the explicit « En savoir plus » tap, capped per session. Only counts leave the device.
 */
export const MIN_EXPOSURE_MS = 1000
export const REPEAT_MS = 30_000
export const MAX_CLICKS_PER_CAMPAIGN = 3

export interface AdCount {
  campaign: string
  placement: string
  impressions: number
  clicks: number
}

export class ExposureTracker {
  private since = new Map<string, number>()
  private lastCounted = new Map<string, number>()
  private counts = new Map<string, AdCount>()
  private clicksBy = new Map<string, number>()

  private entry(campaign: string, placement: string) {
    const k = `${campaign}|${placement}`
    let e = this.counts.get(k)
    if (!e) {
      e = { campaign, placement, impressions: 0, clicks: 0 }
      this.counts.set(k, e)
    }
    return e
  }

  /** Call a few times a second with what is on screen now. Returns new impressions. */
  observe(now: number, visible: { campaign: string; placement: string }[]): number {
    let added = 0
    const keys = new Set(visible.map((v) => `${v.campaign}|${v.placement}`))
    for (const k of this.since.keys()) if (!keys.has(k)) this.since.delete(k)
    for (const v of visible) {
      const k = `${v.campaign}|${v.placement}`
      const start = this.since.get(k) ?? now
      this.since.set(k, start)
      const last = this.lastCounted.get(k) ?? Number.NEGATIVE_INFINITY
      if (now - start >= MIN_EXPOSURE_MS && now - last >= REPEAT_MS) {
        this.entry(v.campaign, v.placement).impressions++
        this.lastCounted.set(k, now)
        added++
      }
    }
    return added
  }

  /** A deliberate tap on « En savoir plus ». Returns false once the cap is reached. */
  click(campaign: string, placement: string): boolean {
    const n = this.clicksBy.get(campaign) ?? 0
    if (n >= MAX_CLICKS_PER_CAMPAIGN) return false
    this.clicksBy.set(campaign, n + 1)
    this.entry(campaign, placement).clicks++
    return true
  }

  /** Counts accumulated since the last flush (then reset). */
  flush(): AdCount[] {
    const out = [...this.counts.values()].filter((c) => c.impressions || c.clicks)
    this.counts.clear()
    return out
  }
}
