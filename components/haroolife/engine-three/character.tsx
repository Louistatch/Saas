'use client'

import { avatarSpec, heightScale, playsOnce } from '@/lib/haroolife/city/avatar-catalog'
import type { NpcAnim } from '@/lib/haroolife/city/interiors'
/**
 * A figure (Kenney Mini Character, CC0, or Rocketbox human adult, MIT) for the React Three
 * Fiber renderer: the same rigged glTF and the same clips as the PlayCanvas `Character`, read
 * from `avatar-catalog.ts` and played by an AnimationMixer with 150 ms cross-fades. Each
 * instance clones the skeleton (`SkeletonUtils.clone`): a plain scene clone would share bones
 * between characters.
 */
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'

export const Character = forwardRef<
  THREE.Group,
  {
    model: string
    name: string
    anim: NpcAnim
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
    const clip = spec.clips[anim] ?? 'idle'
    const next = actions.get(clip) ?? actions.get('idle') ?? null
    if (!next || next === current.current) return
    if (playsOnce(spec, clip)) {
      next.setLoop(THREE.LoopOnce, 1)
      next.clampWhenFinished = true
    } else next.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY)
    next.reset().fadeIn(0.15).play()
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

  // Kenney figures only: the human avatars wear their own clothes.
  const pagneMaterial = useMemo(
    () =>
      pagne && spec.pagne ? new THREE.MeshStandardMaterial({ color: pagne, roughness: 0.9 }) : null,
    [pagne, spec],
  )
  useEffect(() => () => pagneMaterial?.dispose(), [pagneMaterial])

  return (
    <group
      ref={ref}
      name={name}
      position={position}
      rotation={[0, THREE.MathUtils.degToRad(rotation + spec.yaw), 0]}
      // Every caller's `scale` is tuned for Kenney figures: a human is shrunk to the same height.
      scale={scale * heightScale(spec)}
    >
      <primitive object={figure} />
      {pagneMaterial && spec.pagne && (
        // Same wrap as the PlayCanvas renderer: hips to mid-thigh on a 0.66-unit figure.
        <mesh
          name="pagne"
          position={[0, spec.pagne.y, -0.02]}
          scale={spec.pagne.scale}
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
