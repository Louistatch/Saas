'use client'

import { HAROOLIFE_ASSETS } from '@/lib/haroolife/assets'
import { deviceAlive, releaseEntity } from '@/lib/haroolife/city/gpu'
import type { NpcAnim } from '@/lib/haroolife/city/interiors'
/**
 * An animated Kenney Mini Character (CC0): a real skinned glTF with its own clips
 * (idle, walk, sprint, sit, crouch…). The entity is instantiated imperatively from the
 * loaded container so the PlayCanvas anim component can drive the skeleton.
 */
import { useApp, useModel } from '@playcanvas/react/hooks'
import * as pc from 'playcanvas'
import { useEffect, useRef } from 'react'

export const CHARACTER_BASE = `${HAROOLIFE_ASSETS}/vendor/kenney-3d/mini-characters/`
/** Kenney clip names for each activity. */
const CLIP: Record<NpcAnim, string> = {
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

type Container = {
  instantiateRenderEntity: (opts?: object) => pc.Entity
  animations: pc.Asset[]
}

export function Character({
  model,
  position,
  rotation = 0,
  anim = 'idle',
  scale = 1,
  name,
  active = true,
  imperative = false,
  speed = 1,
  pagne,
  onEntity,
}: {
  model: string
  position: [number, number, number]
  rotation?: number
  anim?: NpcAnim
  scale?: number
  name?: string
  /** False freezes the skeleton (off-screen or far characters cost no animation time). */
  active?: boolean
  /** True when a rig moves the entity every frame: props place it once, never again. */
  imperative?: boolean
  /** Playback rate of the current clip (walk cycles match the ground speed). */
  speed?: number
  /** Hex colour of a pagne worn as a wrap around the hips, or none. */
  pagne?: string
  /** Receives the root entity, so a parent can move it imperatively between renders. */
  onEntity?: (e: pc.Entity | null) => void
}) {
  const app = useApp()
  const { asset } = useModel(`${CHARACTER_BASE}${model}.glb`)
  const holder = useRef<pc.Entity | null>(null)
  const figure = useRef<pc.Entity | null>(null)
  const current = useRef<string | null>(null)
  const band = useRef<pc.Entity | null>(null)

  // Create the skinned figure once the container is loaded (the first clip is read once).
  // biome-ignore lint/correctness/useExhaustiveDependencies: anim changes are handled below
  useEffect(() => {
    if (!app || !asset?.resource) return
    const container = asset.resource as unknown as Container
    const root = new pc.Entity(name ?? `Personnage ${model}`)
    const fig = container.instantiateRenderEntity()
    root.addChild(fig)
    app.root.addChild(root)
    holder.current = root
    figure.current = fig
    band.current = null
    onEntity?.(root)
    const clips = container.animations
      .map((a) => a.resource as pc.AnimTrack | null)
      .filter((t): t is pc.AnimTrack => Boolean(t))
    if (clips.length) {
      fig.addComponent('anim', { activate: true })
      const states = clips.map((t) => ({ name: t.name, speed: 1, loop: true }))
      const first = CLIP[anim] ?? 'idle'
      fig.anim?.loadStateGraph(
        new pc.AnimStateGraph({
          layers: [
            {
              name: 'Base',
              states: [{ name: 'START' }, ...states],
              transitions: [
                { from: 'START', to: clips.some((t) => t.name === first) ? first : clips[0].name },
              ],
            },
          ],
          parameters: {},
        }),
      )
      for (const t of clips) fig.anim?.baseLayer?.assignAnimation(t.name, t)
      current.current = first
    }
    return () => {
      onEntity?.(null)
      releaseEntity(root)
      holder.current = null
      figure.current = null
      current.current = null
    }
  }, [app, asset, model, name])
  // Freeze or resume the skeleton.
  useEffect(() => {
    const fig = figure.current
    if (fig?.anim) fig.anim.playing = active
  }, [active])

  // Follow position, rotation and scale from props without re-instantiating.
  const placed = useRef(false)
  useEffect(() => {
    const root = holder.current
    if (!root) return
    if (imperative && placed.current) return
    placed.current = true
    root.setLocalPosition(position[0], position[1], position[2])
    root.setLocalEulerAngles(0, rotation, 0)
    root.setLocalScale(scale, scale, scale)
  })
  // Switch clip when the activity changes.
  useEffect(() => {
    const fig = figure.current
    const layer = fig?.anim?.baseLayer
    if (!fig || !layer) return
    const clip = CLIP[anim] ?? 'idle'
    if (current.current === clip) return
    const known = (
      fig.anim as unknown as {
        animationAssets?: object
        _stateGraph?: { layers: { states: { name: string }[] }[] }
      }
    )?._stateGraph?.layers?.[0]?.states?.some((s) => s.name === clip)
    if (known === false) return
    try {
      layer.transition(clip, 0.15)
      current.current = clip
    } catch {
      /* clip missing in this model: keep the current one */
    }
  }, [anim])
  // The pagne: a wrap around the hips in the chosen colour (a flat ring of boxes).
  useEffect(() => {
    const root = holder.current
    if (!root || !app) return
    if (band.current) {
      releaseEntity(band.current)
      band.current = null
    }
    if (!pagne) return
    const e = new pc.Entity('pagne')
    const mat = new pc.StandardMaterial()
    mat.diffuse.fromString(pagne)
    mat.gloss = 0.1
    mat.update()
    e.addComponent('render', { type: 'box', material: mat })
    // Mini characters stand 0.66 units tall, hips at ~0.18: a wrap from the hips to mid-thigh.
    e.setLocalPosition(0, 0.16, -0.02)
    e.setLocalScale(0.3, 0.13, 0.22)
    root.addChild(e)
    band.current = e
    return () => {
      releaseEntity(e)
      if (deviceAlive(app.graphicsDevice)) mat.destroy()
      band.current = null
    }
  }, [pagne, app, asset])
  useEffect(() => {
    const fig = figure.current
    if (fig?.anim) fig.anim.speed = speed
  }, [speed])
  return null
}
