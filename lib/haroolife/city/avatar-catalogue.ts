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
  /**
   * Extra yaw (degrees) applied once, on the figure. The convention of both renderers is
   * heading 0 = facing +Z (heading = atan2(dx, dz)); every file of the catalogue faces +Z in
   * bind pose and in every clip (calibrated visually, see docs/haroolife-v3-lagos.md), so 0.
   */
  yaw: number
  /** World height at `scale = 1`, relative to FIGURE_HEIGHT (adults stand a little taller). */
  stature: number
  /** Clip name in the file for each activity; missing ones use `fallback`. */
  clips: Partial<Record<NpcAnim, string>>
  /** Clip played when an activity has no clip of its own (standing neutral pose). */
  fallback: string
  /**
   * Ground speed covered by the feet at clip rate 1, in figure heights per second, for the
   * walk and run clips (measured on the stance phase of each file's FootL/FootR bones, V3).
   * The clips are in place (no root translation), so the rate is ground speed ÷ (pace × height).
   */
  pace: { walk: number; run: number }
  /** Materials recoloured with the chosen pagne (a garment). Empty: a wrap is added instead. */
  pagneMaterials: string[]
  /**
   * Fixed colours of the other garments (material name → colour): every piece of clothing is
   * coloured on purpose, none keeps the file's light grey (`White`) that read as a white body.
   */
  outfit: Record<string, string>
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
  outfit: Record<string, string>,
  pace: { walk: number; run: number },
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
  // Measured (V3): the four files face +Z in bind pose and in Idle/Walk/Run/Interact, like
  // the mini characters. The former 180° made every adult walk backwards (dot −1).
  yaw: 0,
  // 1.2 × the mini height: an adult of about 1.07 units beside the 1.35-scaled player capsule.
  stature: 1.2,
  clips: QUATERNIUS_CLIPS,
  fallback: 'Idle_Neutral',
  pace,
  pagneMaterials,
  outfit,
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
  // Estimate (the mini rigs have no named foot bones to measure): short legs, quick steps.
  pace: { walk: 1, run: 1.9 },
  pagneMaterials: [],
  outfit: {},
  skin: null,
  hair: null,
})

export const AVATAR_SPECS: AvatarSpec[] = [
  // Material roles measured on each file (triangle counts and a render per material), V3:
  // Women_Casual: White = top, Orange = trousers, Grey = shoes, Hair_Blond = hair,
  //   Hair_Brown = eyebrows, Brown = eyes.
  quaternius(
    'afi',
    'Women_Casual',
    'Afi',
    'Haut en pagne, pantalon bleu',
    ['White'],
    { Orange: '#24476b', Grey: '#3b2a20' },
    { walk: 0.507, run: 0.866 },
    SKIN_TONES[0],
    ['Skin'],
    ['Hair_Blond', 'Hair_Brown'],
  ),
  // Women_Formal: LimeGreen = dress, Red = hair, Gold = belt, Brown = shoes.
  quaternius(
    'abra',
    'Women_Formal',
    'Abra',
    'Robe en pagne',
    ['LimeGreen'],
    { Gold: '#c9932e' },
    { walk: 0.509, run: 0.871 },
    SKIN_TONES[2],
    ['Skin'],
    ['Red'],
  ),
  // Casual_2: LightBrown = shirt, LightBlue = jeans, Red_Dark = shoes, White = soles,
  //   Skin_Darker = lips and ears, Eyebrows, Hair.
  quaternius(
    'kossi',
    'Casual_2',
    'Kossi',
    'Chemise en pagne, jean',
    ['LightBrown'],
    { LightBlue: '#22344a', Red_Dark: '#4a3122', White: '#d9cdb8' },
    { walk: 0.631, run: 1.079 },
    SKIN_TONES[1],
    ['Skin', 'Skin_Darker'],
    ['Hair', 'Eyebrows'],
  ),
  // Casual_Hoodie: Purple = hoodie, LightBlue = shorts, White = soles, Eyebrows, Hair.
  quaternius(
    'koffi',
    'Casual_Hoodie',
    'Koffi',
    'Sweat en pagne, short ocre',
    ['Purple'],
    { LightBlue: '#8a5a2b', White: '#d9cdb8' },
    { walk: 0.627, run: 1.072 },
    SKIN_TONES[3],
    ['Skin'],
    ['Hair', 'Eyebrows'],
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

/**
 * Figure scales (× FIGURE_HEIGHT × stature): one size for every person in the street (player,
 * passers-by, other players) and one indoors, chosen with the walk speeds below so that the
 * locomotion clips play near their natural rate (V3: about 1.2 render units tall outdoors).
 */
export const STREET_SCALE = 1.5
export const INTERIOR_SCALE = 1.35

/** World height of a figure drawn at `scale` (render units). */
export const figureHeight = (spec: AvatarSpec, scale = 1) => scale * FIGURE_HEIGHT * spec.stature
/**
 * Playback rate of a locomotion clip for a figure moving at `groundSpeed` render units per
 * second (the speed really achieved, after collisions): the feet then cover the ground the
 * body covers. Other clips play at their own rate.
 */
export function clipRate(spec: AvatarSpec, anim: NpcAnim, groundSpeed: number, scale = 1): number {
  if ((anim !== 'walk' && anim !== 'run') || !(groundSpeed > 0)) return 1
  const natural = spec.pace[anim] * figureHeight(spec, scale)
  return Math.min(3, Math.max(0.5, groundSpeed / natural))
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
/** True for the legacy Kenney mini characters. */
export const isMiniModel = (model: string) => model in ADULT_FOR
/** Material name → colour to apply on this figure (outfit, pagne garment, skin, hair). */
export function recolorMap(spec: AvatarSpec, pagne?: string): Map<string, string> {
  const out = new Map<string, string>(Object.entries(spec.outfit))
  if (pagne) for (const m of spec.pagneMaterials) out.set(m, pagne)
  if (spec.skin) for (const m of spec.skin.materials) out.set(m, spec.skin.color)
  if (spec.hair) for (const m of spec.hair.materials) out.set(m, spec.hair.color)
  return out
}
/** True when the figure needs the legacy box wrap to show the pagne (no garment to recolour). */
export const needsPagneWrap = (spec: AvatarSpec) => spec.pagneMaterials.length === 0
