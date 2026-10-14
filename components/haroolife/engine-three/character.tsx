'use client'

import {
  type AvatarSpec,
  avatarSpec,
  clipFor,
  figureScale,
  needsPagneWrap,
  recolorMap,
} from '@/lib/haroolife/city/avatar-catalogue'
import type { NpcAnim } from '@/lib/haroolife/city/interiors'
/**
 * A character of the catalogue (Quaternius adult or Kenney mini, both CC0) for the React
 * Three Fiber renderer: the rigged glTF named in the manifest, its clips mapped by
 * `clipFor`, played by an AnimationMixer with 150 ms cross-fades. Each instance clones the
 * skeleton (`SkeletonUtils.clone`): a plain scene clone would share bones between characters.
 * Recoloured materials (pagne garment, skin, hair) are cloned per figure; geometries stay shared.
 */
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'

/** Kept for callers that still build mini-character paths by hand. */
export const CHARACTER_BASE = '/haroolife/vendor/kenney-3d/mini-characters/'

function recolor(figure: THREE.Object3D, spec: AvatarSpec, pagne?: string): THREE.Material[] {
  const colors = recolorMap(spec, pagne)
  const made: THREE.Material[] = []
  if (colors.size === 0) return made
  const cache = new Map<string, THREE.Material>()
  figure.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const next = mats.map((m) => {
      const color = colors.get(m.name)
      if (!color) return m
      let c = cache.get(m.name)
      if (!c) {
        c = m.clone()
        if ('color' in c) (c as THREE.MeshStandardMaterial).color.set(color)
        cache.set(m.name, c)
        made.push(c)
      }
      return c
    })
    mesh.material = Array.isArray(mesh.material) ? next : next[0]
  })
  return made
}

export const Character = forwardRef<
  THREE.Group,
  {
    model: string
    name: string
    anim: NpcAnim
    /** 1 = the mini characters' height (FIGURE_HEIGHT), whatever the model's raw size. */
    scale?: number
    position?: [number, number, number]
    rotation?: number
    /** Playback rate of the current clip. */
    speed?: number
    pagne?: string
  }
>(function Character(
  { model, name, anim, scale = 1, position, rotation = 0, speed = 1, pagne },
  ref,
) {
  const spec = avatarSpec(model)
  const gltf = useGLTF(spec.url)
  const figure = useMemo(() => cloneSkinned(gltf.scene), [gltf.scene])
  const mixer = useMemo(() => new THREE.AnimationMixer(figure), [figure])
  const actions = useMemo(() => {
    const map = new Map<string, THREE.AnimationAction>()
    for (const clip of gltf.animations) map.set(clip.name, mixer.clipAction(clip))
    return map
  }, [gltf.animations, mixer])
  const current = useRef<THREE.AnimationAction | null>(null)

  useEffect(() => {
    const next =
      actions.get(clipFor(spec, anim)) ?? actions.get(spec.fallback) ?? actions.get('idle') ?? null
    if (!next || next === current.current) return
    next.reset().setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY).fadeIn(0.15).play()
    current.current?.fadeOut(0.15)
    current.current = next
  }, [anim, actions, spec])
  useEffect(() => {
    if (current.current) current.current.timeScale = speed
  }, [speed])
  useEffect(
    () => () => {
      mixer.stopAllAction()
      mixer.uncacheRoot(figure)
    },
    [mixer, figure],
  )
  useFrame((_, dt) => mixer.update(Math.min(dt, 0.1)))

  // Garment, skin and hair colours: cloned materials owned by this figure.
  useEffect(() => {
    const made = recolor(figure, spec, pagne)
    return () => {
      for (const m of made) m.dispose()
    }
  }, [figure, spec, pagne])

  const wrap = pagne && needsPagneWrap(spec)
  const pagneMaterial = useMemo(
    () => (wrap ? new THREE.MeshStandardMaterial({ color: pagne, roughness: 0.9 }) : null),
    [wrap, pagne],
  )
  useEffect(() => () => pagneMaterial?.dispose(), [pagneMaterial])
  const s = figureScale(spec, scale)

  return (
    <group
      ref={ref}
      name={name}
      position={position}
      rotation={[0, THREE.MathUtils.degToRad(rotation), 0]}
      scale={scale}
    >
      <group name="figure" scale={s / scale} rotation={[0, THREE.MathUtils.degToRad(spec.yaw), 0]}>
        <primitive object={figure} />
      </group>
      {pagneMaterial && (
        // Legacy mini characters only: a wrap from the hips to mid-thigh on a 0.66-unit figure.
        <mesh
          name="pagne"
          position={[0, 0.16, -0.02]}
          scale={[0.3, 0.13, 0.22]}
          material={pagneMaterial}
        >
          <boxGeometry />
        </mesh>
      )}
      {/* Contact shadow: a soft dark disc instead of a shadow map (no cost on LOW devices). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} renderOrder={-1}>
        <circleGeometry args={[0.22, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  )
})
