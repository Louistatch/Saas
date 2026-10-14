'use client'

import type { NpcAnim } from '@/lib/haroolife/city/interiors'
/**
 * A Kenney Mini Character (CC0) for the React Three Fiber renderer: the same rigged glTF and
 * the same clips as the PlayCanvas `Character`, played by an AnimationMixer with 150 ms
 * cross-fades. Each instance clones the skeleton (`SkeletonUtils.clone`): a plain scene clone
 * would share bones between characters.
 */
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'

export const CHARACTER_BASE = '/haroolife/vendor/kenney-3d/mini-characters/'

/** Kenney clip played for each activity (same table as the PlayCanvas renderer). */
export const CLIP: Record<NpcAnim, string> = {
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
  const gltf = useGLTF(`${CHARACTER_BASE}${model}.glb`)
  const figure = useMemo(() => cloneSkinned(gltf.scene), [gltf.scene])
  const mixer = useMemo(() => new THREE.AnimationMixer(figure), [figure])
  const actions = useMemo(() => {
    const map = new Map<string, THREE.AnimationAction>()
    for (const clip of gltf.animations) map.set(clip.name, mixer.clipAction(clip))
    return map
  }, [gltf.animations, mixer])
  const current = useRef<THREE.AnimationAction | null>(null)

  useEffect(() => {
    const next = actions.get(CLIP[anim]) ?? actions.get('idle') ?? null
    if (!next || next === current.current) return
    next.reset().setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY).fadeIn(0.15).play()
    current.current?.fadeOut(0.15)
    current.current = next
  }, [anim, actions])
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

  const pagneMaterial = useMemo(
    () => (pagne ? new THREE.MeshStandardMaterial({ color: pagne, roughness: 0.9 }) : null),
    [pagne],
  )
  useEffect(() => () => pagneMaterial?.dispose(), [pagneMaterial])

  return (
    <group
      ref={ref}
      name={name}
      position={position}
      rotation={[0, THREE.MathUtils.degToRad(rotation), 0]}
      scale={scale}
    >
      <primitive object={figure} />
      {pagneMaterial && (
        // Same wrap as the PlayCanvas renderer: hips to mid-thigh on a 0.66-unit figure.
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
