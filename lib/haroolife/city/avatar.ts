/**
 * The player's appearance: one of the Kenney Mini Characters (CC0) and the colour of the
 * pagne worn as a wrap, chosen by the player and kept on the device. Never part of the
 * account profile: no sensitive data, no server write.
 */
import { PAGNES } from '@/components/haroolife/pagnes'

export const AVATAR_MODELS = [
  { id: 'character-female-a', label: 'Afi', hint: 'Robe et sandales' },
  { id: 'character-female-b', label: 'Abra', hint: 'Jupe et chemisier' },
  { id: 'character-female-c', label: 'Essi', hint: 'Tenue de ville' },
  { id: 'character-male-a', label: 'Kossi', hint: 'Chemise et pantalon' },
  { id: 'character-male-b', label: 'Koffi', hint: 'Polo et jean' },
  { id: 'character-male-c', label: 'Yao', hint: 'Veste légère' },
] as const
export type AvatarModel = (typeof AVATAR_MODELS)[number]['id']
export interface Avatar {
  v: 1
  model: AvatarModel
  /** 1–8, index into the pagne palette. */
  pagne: number
}
export const DEFAULT_AVATAR: Avatar = { v: 1, model: 'character-female-a', pagne: 1 }
export const AVATAR_STORAGE = 'haroolife.avatar.v1'

export const isAvatarModel = (v: unknown): v is AvatarModel =>
  typeof v === 'string' && AVATAR_MODELS.some((m) => m.id === v)
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
