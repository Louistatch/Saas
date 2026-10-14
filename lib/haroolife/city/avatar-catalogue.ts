/**
 * The one manifest of playable characters, shared by both renderers (PlayCanvas outdoors,
 * React Three Fiber indoors): file, raw height, clip names, which materials take the pagne
 * colour, skin and hair. Two families:
 * - Quaternius adult characters (CC0, public/haroolife/vendor/quaternius): ~1.85 units tall,
 *   clips Idle, Idle_Neutral, Interact, Run, Walk, Wave. The default for new games.
 * - Kenney Mini Characters (CC0, legacy): 0.66 units tall, kept so every existing save and
 *   appearance keeps loading unchanged.
 * Every renderer scales a figure to the same world height (`figureScale`), so doors, chairs and
 * capsules tuned for the mini characters stay right with the adult ones.
 */
import type { NpcAnim } from './interiors'

export type AvatarFamily = 'quaternius' | 'kenney-mini'

export interface AvatarSpec {
  id: string
  label: string
  hint: string
  url: string
  family: AvatarFamily
  /** Height of the raw model, in its own units (measured on the file's bounding box). */
  height: number
  /** Extra yaw (degrees) so the model faces the same way as the mini characters. */
  yaw: number
  /** World height at `scale = 1`, relative to FIGURE_HEIGHT (adults stand a little taller). */
  stature: number
  /** Clip name in the file for each activity; missing ones use `fallback`. */
  clips: Partial<Record<NpcAnim, string>>
  /** Clip played when an activity has no clip of its own (standing neutral pose). */
  fallback: string
  /** Materials recoloured with the chosen pagne (a garment). Empty: a wrap is added instead. */
  pagneMaterials: string[]
  skin: { materials: string[]; color: string } | null
  hair: { materials: string[]; color: string } | null
}

/** Height every figure is scaled to at `scale = 1` (the mini characters' own height). */
export const FIGURE_HEIGHT = 0.66

const QUATERNIUS = '/haroolife/vendor/quaternius/'
const KENNEY = '/haroolife/vendor/kenney-3d/mini-characters/'

/**
 * Activity → Quaternius clip. Sitting, resting, driving and praying have no clip in this pack:
 * the figure keeps a neutral standing pose beside the furniture (never through it) until a
 * compatible clip is added. Documented limit, not a renaming of `Idle`.
 */
const QUATERNIUS_CLIPS: Partial<Record<NpcAnim, string>> = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  work: 'Interact',
  enter: 'Interact',
  lift: 'Interact',
  talk: 'Wave',
}
const KENNEY_CLIPS: Record<NpcAnim, string> = {
  idle: 'idle',
  walk: 'walk',
  run: 'sprint',
  sit: 'sit',
  lift: 'holding-both',
  talk: 'emote-yes',
  work: 'interact-right',
  pray: 'crouch',
  rest: 'sit',
  drive: 'drive',
  enter: 'interact-right',
}

/** Skin tones of the reference (dark to deep), hair near-black. */
export const SKIN_TONES = ['#6b3e28', '#4b2d20', '#855235', '#593522'] as const
export const HAIR_COLOR = '#221b18'

const quaternius = (
  id: string,
  file: string,
  label: string,
  hint: string,
  pagneMaterials: string[],
  skin: string,
  skinMaterials: string[],
  hairMaterials: string[],
): AvatarSpec => ({
  id,
  label,
  hint,
  url: `${QUATERNIUS}${file}.glb`,
  family: 'quaternius',
  height: 1.85,
  // Measured on the preview: the file faces -Z, the mini characters face +Z.
  yaw: 180,
  // 1.2 × the mini height: an adult of about 1.07 units beside the 1.35-scaled player capsule.
  stature: 1.2,
  clips: QUATERNIUS_CLIPS,
  fallback: 'Idle_Neutral',
  pagneMaterials,
  skin: { materials: skinMaterials, color: skin },
  hair: { materials: hairMaterials, color: HAIR_COLOR },
})
const kenney = (id: string, label: string, hint: string): AvatarSpec => ({
  id,
  label,
  hint,
  url: `${KENNEY}${id}.glb`,
  family: 'kenney-mini',
  height: FIGURE_HEIGHT,
  yaw: 0,
  stature: 1,
  clips: KENNEY_CLIPS,
  fallback: 'idle',
  pagneMaterials: [],
  skin: null,
  hair: null,
})

export const AVATAR_SPECS: AvatarSpec[] = [
  quaternius(
    'afi',
    'Women_Casual',
    'Afi',
    'Tenue décontractée',
    ['Orange'],
    SKIN_TONES[0],
    ['Skin'],
    ['Hair_Brown', 'Hair_Blond'],
  ),
  quaternius(
    'abra',
    'Women_Formal',
    'Abra',
    'Tenue habillée',
    ['Red'],
    SKIN_TONES[2],
    ['Skin'],
    [],
  ),
  quaternius(
    'kossi',
    'Casual_2',
    'Kossi',
    'Chemise et pantalon',
    ['Red_Dark'],
    SKIN_TONES[1],
    ['Skin', 'Skin_Darker'],
    ['Hair'],
  ),
  quaternius(
    'koffi',
    'Casual_Hoodie',
    'Koffi',
    'Sweat à capuche',
    ['Purple'],
    SKIN_TONES[3],
    ['Skin'],
    ['Hair'],
  ),
  // Legacy mini characters: still loadable from old saves and selectable as « classiques ».
  kenney('character-female-a', 'Afi (mini)', 'Robe et sandales'),
  kenney('character-female-b', 'Abra (mini)', 'Jupe et chemisier'),
  kenney('character-female-c', 'Essi (mini)', 'Tenue de ville'),
  kenney('character-male-a', 'Kossi (mini)', 'Chemise et pantalon'),
  kenney('character-male-b', 'Koffi (mini)', 'Polo et jean'),
  kenney('character-male-c', 'Yao (mini)', 'Veste légère'),
]

const BY_ID = new Map(AVATAR_SPECS.map((s) => [s.id, s]))
const LEGACY_DEFAULT = BY_ID.get('character-male-a') as AvatarSpec

/** Spec for a model id; unknown ids (an NPC model name from a layout) fall back to a mini character. */
export function avatarSpec(model: string): AvatarSpec {
  return BY_ID.get(model) ?? { ...LEGACY_DEFAULT, id: model, url: `${KENNEY}${model}.glb` }
}
export const avatarUrl = (model: string) => avatarSpec(model).url
/** Clip to play for an activity, or the neutral fallback when the pack has none. */
export function clipFor(spec: AvatarSpec, anim: NpcAnim): string {
  return spec.clips[anim] ?? spec.fallback
}
/** Scale to apply to the raw model so that `scale = 1` stands FIGURE_HEIGHT × stature tall. */
export function figureScale(spec: AvatarSpec, scale = 1): number {
  return (scale * FIGURE_HEIGHT * spec.stature) / spec.height
}

/** Adult counterpart of a legacy mini-character id, for non-player characters in the scenes. */
const ADULT_FOR: Record<string, string> = {
  'character-female-a': 'afi',
  'character-female-b': 'abra',
  'character-female-c': 'afi',
  'character-male-a': 'kossi',
  'character-male-b': 'koffi',
  'character-male-c': 'kossi',
}
export const adultFor = (model: string) => ADULT_FOR[model] ?? model
/** Material name → colour to apply on this figure (pagne garment, skin, hair). */
export function recolorMap(spec: AvatarSpec, pagne?: string): Map<string, string> {
  const out = new Map<string, string>()
  if (pagne) for (const m of spec.pagneMaterials) out.set(m, pagne)
  if (spec.skin) for (const m of spec.skin.materials) out.set(m, spec.skin.color)
  if (spec.hair) for (const m of spec.hair.materials) out.set(m, spec.hair.color)
  return out
}
/** True when the figure needs the legacy box wrap to show the pagne (no garment to recolour). */
export const needsPagneWrap = (spec: AvatarSpec) => spec.pagneMaterials.length === 0
