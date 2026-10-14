/**
 * The player's appearance: a character of the catalogue (adult Quaternius figures, or the
 * legacy Kenney Mini Characters still loadable from old saves) and the colour of the pagne,
 * chosen by the player and kept on the device. Never part of the account profile: no sensitive
 * data, no server write. The storage key and shape (`v: 1`) are unchanged, so an old choice
 * loads as is and a new one never resets any progress.
 */
import { PAGNES } from '@/components/haroolife/pagnes'
import { AVATAR_SPECS } from './avatar-catalogue'

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
}
/** New game: the first adult character. Old saves keep their own model. */
export const DEFAULT_AVATAR: Avatar = { v: 1, model: 'afi', pagne: 1 }
export const AVATAR_STORAGE = 'haroolife.avatar.v1'
/** Set once the player has confirmed a look (the new-game selection is skipped afterwards). */
export const AVATAR_CHOSEN_STORAGE = 'haroolife.avatar.chosen'

export const isAvatarModel = (v: unknown): v is AvatarModel =>
  typeof v === 'string' && AVATAR_SPECS.some((m) => m.id === v)
export function decodeAvatar(value: unknown): Avatar | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Partial<Avatar>
  if (v.v !== 1 || !isAvatarModel(v.model)) return null
  const pagne =
    Number.isInteger(v.pagne) && v.pagne! >= 1 && v.pagne! <= PAGNES.length ? v.pagne! : 1
  return { v: 1, model: v.model, pagne }
}
export const pagneColor = (pagne: number) => PAGNES[(pagne - 1) % PAGNES.length] ?? PAGNES[0]
export function loadAvatar(storage: { getItem(k: string): string | null }): Avatar {
  try {
    const raw = storage.getItem(AVATAR_STORAGE)
    return (raw && decodeAvatar(JSON.parse(raw))) || DEFAULT_AVATAR
  } catch {
    return DEFAULT_AVATAR
  }
}
export function saveAvatar(storage: { setItem(k: string, v: string): void }, a: Avatar) {
  try {
    storage.setItem(AVATAR_STORAGE, JSON.stringify(a))
  } catch {
    /* blocked storage: the choice lasts for the session */
  }
}
