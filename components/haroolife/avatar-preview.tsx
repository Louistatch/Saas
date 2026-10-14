'use client'

import { Canvas, useFrame } from '@react-three/fiber'
/**
 * Animated 3D preview of a character for the appearance sheet: the same `Character` as the
 * interiors (same manifest, same clips), idle, turning slowly. Mounted only while the sheet is
 * open, so the three.js chunk is never part of the first load of /haroolife.
 */
import { Suspense, useRef } from 'react'
import type { Group } from 'three'
import { Character } from './engine-three/character'

function Turntable({ model, pagne }: { model: string; pagne: string }) {
  const ref = useRef<Group>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.5
  })
  return (
    <group ref={ref} position={[0, -0.4, 0]}>
      <Character name="Aperçu" model={model} anim="idle" pagne={pagne} scale={1.2} />
    </group>
  )
}

export default function AvatarPreview({ model, pagne }: { model: string; pagne: string }) {
  return (
    <div
      className="h-52 w-full overflow-hidden rounded-2xl bg-[#e4eedd]"
      aria-label="Aperçu animé du personnage"
      role="img"
    >
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        camera={{ fov: 30, near: 0.1, far: 20, position: [0, 0.55, 2.6] }}
        onCreated={({ gl }) =>
          gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault())
        }
      >
        <hemisphereLight args={['#f4f8ff', '#8a7a62', 1.2]} />
        <directionalLight position={[2, 4, 3]} intensity={1.6} />
        <Suspense fallback={null}>
          <Turntable model={model} pagne={pagne} />
        </Suspense>
      </Canvas>
    </div>
  )
}
