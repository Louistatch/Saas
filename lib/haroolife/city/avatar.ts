/**
 * The player's appearance: a figure (Kenney Mini Character, CC0, or a Rocketbox human adult,
 * MIT) and the colour of the pagne worn as a wrap, chosen by the player and kept on the
 * device. Never part of the account profile: no sensitive data, no server write. Where each
 * figure's model lives and how it animates is in `avatar-catalog.ts`.
 */
import { PAGNES } from '@/components/haroolife/pagnes'

export const AVATAR_MODELS = [
  { id: 'rb-female-party-02', label: 'Ama', hint: 'Robe de soirée', kind: 'human' },
  { id: 'rb-male-04', label: 'Komlan', hint: 'Chemise claire et jean', kind: 'human' },
  { id: 'rb-male-12', label: 'Edem', hint: 'T-shirt et pantalon', kind: 'human' },
  { id: 'rb-male-18', label: 'Sena', hint: 'Tenue décontractée', kind: 'human' },
  { id: 'character-female-a', label: 'Afi', hint: 'Robe et sandales', kind: 'kenney' },
  { id: 'character-female-b', label: 'Abra', hint: 'Jupe et chemisier', kind: 'kenney' },
  { id: 'character-female-c', label: 'Essi', hint: 'Tenue de ville', kind: 'kenney' },
  { id: 'character-male-a', label: 'Kossi', hint: 'Chemise et pantalon', kind: 'kenney' },
  { id: 'character-male-b', label: 'Koffi', hint: 'Polo et jean', kind: 'kenney' },
  { id: 'character-male-c', label: 'Yao', hint: 'Veste légère', kind: 'kenney' },
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
