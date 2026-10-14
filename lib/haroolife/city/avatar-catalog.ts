/**
 * Every character model the game can show, for both renderers: where its GLB lives, how tall it
 * stands in its own units, which of its clips plays each activity, and whether it wears the pagne
 * wrap. Kenney Mini Characters (CC0) are the toy-like figures used since the start; Rocketbox
 * (MIT) are human adults added in jalon J2.
 */
import type { NpcAnim } from './interiors'

const VENDOR = '/haroolife/vendor'

export type AvatarKind = 'kenney' | 'human'

export interface AvatarSpec {
  id: string
  kind: AvatarKind
  /** GLB with the rigged body and its clips. */
  url: string
  /** Standing height in the model's own units (Kenney 0.66, Rocketbox adults ≈ 1.87). */
  height: number
  /** Clip name in the GLB for each game activity. */
  clips: Record<NpcAnim, string>
  /** Clips that play once and hold (everything else loops). */
  oneShot: ReadonlySet<string>
  /** The pagne wrap: where it sits on the hips, or absent (human avatars have real clothes). */
  pagne: { y: number; scale: [number, number, number] } | null
  /** Degrees added to the heading so the model faces the way the game's figures face. */
  yaw: number
}

/** Kenney Mini Characters stand 0.66 units tall; every caller's `scale` was tuned for them. */
export const KENNEY_HEIGHT = 0.66

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
/** Rocketbox clips baked by scripts/haroolife-bake-avatars.mjs. */
const HUMAN_CLIPS: Record<NpcAnim, string> = {
  idle: 'idle',
  walk: 'walk',
  run: 'run',
  sit: 'sit',
  lift: 'idle',
  talk: 'talk',
  work: 'phone-text',
  pray: 'sit',
  rest: 'sit',
  drive: 'sit',
  enter: 'door',
}
const HUMAN_ONE_SHOT = new Set(['turn-left', 'turn-right', 'sit-down', 'stand-up', 'wave', 'door'])
const NONE = new Set<string>()

const kenney = (id: string): AvatarSpec => ({
  id,
  kind: 'kenney',
  url: `${VENDOR}/kenney-3d/mini-characters/${id}.glb`,
  height: KENNEY_HEIGHT,
  clips: KENNEY_CLIPS,
  oneShot: NONE,
  // Mini characters stand 0.66 units tall, hips at ~0.18: a wrap from the hips to mid-thigh.
  pagne: { y: 0.16, scale: [0.3, 0.13, 0.22] },
  yaw: 0,
})
const human = (id: string): AvatarSpec => ({
  id,
  kind: 'human',
  url: `${VENDOR}/rocketbox/${id}.glb`,
  height: 1.87,
  clips: HUMAN_CLIPS,
  oneShot: HUMAN_ONE_SHOT,
  pagne: null,
  yaw: 0,
})

export const AVATAR_CATALOG: Record<string, AvatarSpec> = Object.fromEntries(
  [
    kenney('character-female-a'),
    kenney('character-female-b'),
    kenney('character-female-c'),
    kenney('character-male-a'),
    kenney('character-male-b'),
    kenney('character-male-c'),
    human('rb-male-04'),
    human('rb-male-12'),
    human('rb-male-18'),
    human('rb-female-party-02'),
  ].map((s) => [s.id, s]),
)

export const DEFAULT_SPEC = AVATAR_CATALOG['character-female-a']

/** The spec for a model id; unknown ids (an old save, another player's newer build) fall back. */
export function avatarSpec(id: string): AvatarSpec {
  return AVATAR_CATALOG[id] ?? DEFAULT_SPEC
}

/**
 * Multiplier that makes a model as tall as a Kenney figure at the same `scale`, so a human
 * avatar fits the streets, doors and furniture tuned for Kenney proportions.
 */
export function heightScale(spec: AvatarSpec): number {
  return KENNEY_HEIGHT / spec.height
}

/** True when the clip plays once and holds its last frame instead of looping. */
export function playsOnce(spec: AvatarSpec, clip: string): boolean {
  return spec.oneShot.has(clip)
}
