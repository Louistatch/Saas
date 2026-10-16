/**
 * The game saved online: which copy of the player's game wins when it opens (this phone's or the
 * one saved from another device), with no network or React in here so the rule is tested alone.
 *
 * Each device remembers, next to its local save, whose game it is (owner), the online version it
 * last agreed with and when it last changed and synced. On opening:
 *   - nothing online yet: this phone's game is saved online (a fresh one when the local game
 *     belongs to another account that played on this phone);
 *   - the online game is the one this phone last saved: keep playing here, save on top of it;
 *   - another device saved since: the most recent wins (the online one, unless this phone has
 *     changes made after it);
 *   - the local game is someone else's, or unknown: the online game.
 */

export const CLOUD_META = 'haroolife.cloud.v1'

export interface CloudMeta {
  /** Account the local game belongs to. */
  owner: string
  /** Online version this phone last saved or loaded. */
  version: number
  /** Last successful sync (ms). */
  syncedAt: number
  /** Last change of the local game (ms). */
  localAt: number
}

export interface CloudCopy {
  save: unknown
  version: number
  updated_at: string
  wallet: number
}

export type Decision =
  | { action: 'push-local'; base: number }
  | { action: 'push-fresh'; base: number }
  | { action: 'adopt-cloud'; base: number }

export function decideOnLoad(
  user: string,
  meta: CloudMeta | null,
  cloud: CloudCopy | null,
): Decision {
  const mine = meta?.owner === user
  if (!cloud)
    return meta && !mine ? { action: 'push-fresh', base: 0 } : { action: 'push-local', base: 0 }
  if (!mine || !meta) return { action: 'adopt-cloud', base: cloud.version }
  if (meta.version === cloud.version) return { action: 'push-local', base: cloud.version }
  const cloudAt = Date.parse(cloud.updated_at) || 0
  const localChanged = meta.localAt > meta.syncedAt
  return localChanged && meta.localAt > cloudAt
    ? { action: 'push-local', base: cloud.version }
    : { action: 'adopt-cloud', base: cloud.version }
}

export function readMeta(raw: string | null): CloudMeta | null {
  if (!raw) return null
  try {
    const m = JSON.parse(raw) as Partial<CloudMeta>
    if (typeof m.owner !== 'string' || !Number.isInteger(m.version)) return null
    return {
      owner: m.owner,
      version: m.version as number,
      syncedAt: Number(m.syncedAt) || 0,
      localAt: Number(m.localAt) || 0,
    }
  } catch {
    return null
  }
}
