/**
 * The player's appearance: a character of the catalogue (adult Quaternius figures, or the
 * historic mini-character ids migrated to adult models) and the colour of the pagne,
 * chosen by the player and kept on the device. Never part of the account profile: no sensitive
 * data, no server write. The storage key and shape (`v: 1`) are unchanged, so an old choice
 * migrates its model without resetting any game progress.
 */
import { PAGNES } from '@/components/haroolife/pagnes'
import { AVATAR_SPECS, adultFor, avatarSpec, isMiniModel } from './avatar-catalogue'

export const AVATAR_MODELS = AVATAR_SPECS.map((s) => ({
  id: s.id,
  label: s.label,
  hint: s.hint,
  family: s.family,
}))
export type AvatarModel = string
export interface Avatar {
  v: 1
  model: AvatarModel
  /** 1–8, index into the pagne palette. */
  pagne: number
  /** Accepted in historical data only; ignored and removed when migrating. */
  classic?: true
}
/** New game: the first adult character. Old saves keep their corresponding adult and outfit. */
export const DEFAULT_AVATAR: Avatar = { v: 1, model: 'afi', pagne: 1 }
export const AVATAR_STORAGE = 'haroolife.avatar.v1'
/** Set once the player has confirmed a look (the new-game selection is skipped afterwards). */
export const AVATAR_CHOSEN_STORAGE = 'haroolife.avatar.chosen'

export const isAvatarModel = (v: unknown): v is AvatarModel =>
  typeof v === 'string' && (AVATAR_SPECS.some((m) => m.id === v) || isMiniModel(v))
export function decodeAvatar(value: unknown): Avatar | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Partial<Avatar>
  if (v.v !== 1 || !isAvatarModel(v.model)) return null
  const pagne =
    typeof v.pagne === 'number' &&
    Number.isInteger(v.pagne) &&
    v.pagne >= 1 &&
    v.pagne <= PAGNES.length
      ? v.pagne
      : 1
  return { v: 1, model: adultFor(v.model), pagne }
}
/** Every code path renders an adult, including a historical classic:true choice. */
export const shownModel = (a: Avatar): AvatarModel => avatarSpec(a.model).id
export const pagneColor = (pagne: number) => PAGNES[(pagne - 1) % PAGNES.length] ?? PAGNES[0]
export function loadAvatar(storage: {
  getItem(k: string): string | null
  setItem?(k: string, value: string): void
}): Avatar {
  try {
    const raw = storage.getItem(AVATAR_STORAGE)
    const decoded = raw ? decodeAvatar(JSON.parse(raw)) : null
    if (decoded && storage.setItem && JSON.stringify(decoded) !== raw) {
      try {
        storage.setItem(AVATAR_STORAGE, JSON.stringify(decoded))
      } catch {
        /* A full or read-only store must not discard the decoded look. */
      }
    }
    return decoded ?? DEFAULT_AVATAR
  } catch {
    return DEFAULT_AVATAR
  }
}
export function saveAvatar(storage: { setItem(k: string, v: string): void }, a: Avatar) {
  try {
    storage.setItem(AVATAR_STORAGE, JSON.stringify(decodeAvatar(a) ?? DEFAULT_AVATAR))
  } catch {
    /* blocked storage: the choice lasts for the session */
  }
}
