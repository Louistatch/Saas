/**
 * The contract between the HarooLife game (state, HUD, saves, realtime) and a 3D renderer.
 *
 * The game never reaches into a renderer: it hands a scene its props and reads back events.
 * Renderers: PlayCanvas (the street), React Three Fiber (interiors) and the HarooLife engine
 * (the house, replacing both scene by scene). Saves and game state do not depend on the renderer, so switching
 * back is a setting, never a data migration.
 */
import type { Layout, Npc, NpcAnim, Prop } from '@/lib/haroolife/city/interiors'
import type { InputState } from '@/lib/haroolife/city/player'
import type { Meal } from '@/lib/haroolife/city/dining'

export interface DailyViewProps {
  meal?: Meal | null
  onMealReady?: (id: string, seat: string | null) => void
  onMealFrame?: (id: string, seconds: number) => void
  onActivityEnd?: () => void
}

/** `haroo`: the HarooLife engine (imperative Three.js, `lib/haroolife/game`) for the interiors. */
export type RendererId = 'three' | 'haroo'

/** Props every interior renderer takes. */
export interface InteriorViewProps extends DailyViewProps {
  layout: Layout
  title: string
  /** Camera bearing in degrees (the street camera's, so entering keeps the orientation). */
  angle: number
  /** Equipment in use and the animation to play, from the game state. */
  activity: { prop: string; anim: NpcAnim } | null
  playerModel: string
  /** Hex colour of the pagne, or none. */
  playerPagne?: string
  onUse: (p: Prop) => void
  /** Joystick and keyboard input (mutated in place by the HUD controls). */
  input: InputState
  /** Leave the building (walking out through the door, where the renderer supports it). */
  onLeave: () => void
  /**
   * Walk to this equipment, then use it (an activity button of the HUD). `n` changes on every
   * request, so asking twice for the same equipment is two requests.
   */
  approach?: { prop: string; n: number } | null
  /** A non-player character was reached after being tapped: open the conversation. */
  onTalk?: (npc: Npc) => void
  /** Short message for the player (an approach that could not reach its target). */
  onNotice?: (message: string) => void
}

/**
 * Engine-neutral view of the scene for end-to-end tests (`window.__LOME_SCENE`). Each renderer
 * implements it, so a test reads "is there an entity named Joueur" without knowing which engine
 * draws it.
 */
export interface SceneProbe {
  engine: RendererId
  /** True when an object with this exact name exists in the scene. */
  has: (name: string) => boolean
  /** Names of the direct children of the named object, or null when it does not exist. */
  childNames: (name: string) => string[] | null
  /** World position of the named object, or null. */
  position: (name: string) => { x: number; y: number; z: number } | null
  /** Number of objects in the scene graph. */
  count: () => number
  /** Objects whose name matches the pattern, and the triangles drawn beneath them. */
  geometry: (pattern: string) => { matches: number; triangles: number }
  /** GPU resources currently held; vram in MB when the engine tracks it. */
  gpu: () => {
    textures: number
    buffers: number
    vramMB: { tex: number; vb: number; ib: number } | null
  }
}
