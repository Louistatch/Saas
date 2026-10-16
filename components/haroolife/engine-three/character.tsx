'use client'

import {
  type AvatarSpec,
  avatarSpec,
  clipFor,
  clipRate,
  figureScale,
  recolorMap,
} from '@/lib/haroolife/city/avatar-catalogue'
import { avatarAnimations } from '@/lib/haroolife/game/render/avatar-actor'
import type { NpcAnim } from '@/lib/haroolife/city/interiors'
/**
 * An adult character of the shared CC0 catalogue for the React
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

/**
 * Recolours this figure's garments, skin and hair on cloned materials and returns the undo.
 * The file's own material of every mesh is remembered (`userData.baseMaterial`) and always
 * used as the source, so a second pass (another pagne, another model) never clones a clone
 * that was just disposed. Clones are cached per source material object, never per name: two
 * distinct materials that happen to share a name are not merged. The undo puts the base
 * materials back before disposing the clones; geometries and textures stay shared.
 */
function recolor(figure: THREE.Object3D, spec: AvatarSpec, pagne?: string): () => void {
  const colors = recolorMap(spec, pagne)
  if (colors.size === 0) return () => {}
  const made: THREE.Material[] = []
  const touched: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []
  const cache = new Map<THREE.Material, THREE.Material>()
  figure.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const base = (mesh.userData.baseMaterial ?? mesh.material) as THREE.Material | THREE.Material[]
    mesh.userData.baseMaterial = base
    const mats = Array.isArray(base) ? base : [base]
    let changed = false
    const next = mats.map((m) => {
      const color = colors.get(m.name)
      if (!color) return m
      let c = cache.get(m)
      if (!c) {
        c = m.clone()
        if ('color' in c) (c as THREE.MeshStandardMaterial).color.set(color)
        cache.set(m, c)
        made.push(c)
      }
      changed = true
      return c
    })
    if (!changed) return
    touched.push([mesh, base])
    mesh.material = Array.isArray(base) ? next : next[0]
  })
  return () => {
    for (const [mesh, base] of touched) mesh.material = base
    for (const m of made) m.dispose()
  }
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
    /** Playback rate of the current clip (used when `groundSpeed` is not given). */
    speed?: number
    /** Ground speed really achieved (render units/s): walk/run play at the matching rate. */
    groundSpeed?: number
    pagne?: string
  }
>(function Character(
  { model, name, anim, scale = 1, position, rotation = 0, speed = 1, groundSpeed, pagne },
  ref,
) {
  const spec = avatarSpec(model)
  const gltf = useGLTF(spec.url)
  const figure = useMemo(() => {
    const cloned = cloneSkinned(gltf.scene)
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.frustumCulled = false
      }
    })
    return cloned
  }, [gltf.scene])
  const mixer = useMemo(() => new THREE.AnimationMixer(figure), [figure])
  const actions = useMemo(() => {
    const map = new Map<string, THREE.AnimationAction>()
    for (const clip of avatarAnimations(gltf)) map.set(clip.name, mixer.clipAction(clip))
    return map
  }, [gltf, mixer])
  const current = useRef<THREE.AnimationAction | null>(null)
  const rate =
    groundSpeed === undefined
      ? speed
      : Math.round(clipRate(spec, anim, groundSpeed, scale) * 20) / 20
  const rateRef = useRef(rate)
  rateRef.current = rate

  useEffect(() => {
    const next =
      actions.get(clipFor(spec, anim)) ?? actions.get(spec.fallback) ?? actions.get('idle') ?? null
    if (!next || next === current.current) return
    next.reset().setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY).fadeIn(0.15).play()
    next.timeScale = rateRef.current
    current.current?.fadeOut(0.15)
    current.current = next
  }, [anim, actions, spec])
  useEffect(() => {
    if (current.current) current.current.timeScale = rate
  }, [rate])
  useEffect(
    () => () => {
      mixer.stopAllAction()
      current.current = null
      mixer.uncacheRoot(figure)
      figure.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose()
      })
    },
    [mixer, figure],
  )
  useFrame((_, dt) => mixer.update(Math.min(dt, 0.1)))

  // Garment, skin and hair colours: cloned materials owned by this figure.
  useEffect(() => recolor(figure, spec, pagne), [figure, spec, pagne])

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
        <primitive object={figure} dispose={null} />
      </group>
      {/* Contact shadow: a soft dark disc instead of a shadow map (no cost on LOW devices). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} renderOrder={-1}>
        <circleGeometry args={[0.22, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  )
})
