'use client'

import { FrameRing, type PerfSnapshot, watchLongTasks } from '@/lib/haroolife/city/perf'
import type { SceneProbe } from '@/lib/haroolife/engine/types'
/**
 * Test and measurement hooks for the React Three Fiber renderer: the same `__LOME_SCENE` and
 * `__LOME_PERF` shapes as PlayCanvas, so specs and the diagnostic overlay read both engines.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

function threeProbe(scene: THREE.Scene, gl: THREE.WebGLRenderer): SceneProbe {
  const named = (name: string) => scene.getObjectByName(name) ?? null
  return {
    engine: 'three',
    has: (name) => Boolean(named(name)),
    childNames: (name) => named(name)?.children.map((c) => c.name) ?? null,
    position: (name) => {
      const o = named(name)
      if (!o) return null
      const p = o.getWorldPosition(o.position.clone())
      return { x: p.x, y: p.y, z: p.z }
    },
    count: () => {
      let n = 0
      scene.traverse(() => {
        n++
      })
      return n
    },
    geometry: (pattern) => {
      const re = new RegExp(pattern)
      let matches = 0
      let triangles = 0
      const walk = (o: THREE.Object3D, inside: boolean) => {
        const mine = re.test(o.name)
        if (mine) matches++
        const here = inside || mine
        const g = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry : null
        if (here && g) triangles += Math.floor((g.index?.count ?? g.attributes.position.count) / 3)
        for (const c of o.children) walk(c, here)
      }
      walk(scene, false)
      return { matches, triangles }
    },
    gpu: () => ({
      textures: gl.info.memory.textures,
      buffers: gl.info.memory.geometries,
      vramMB: null,
    }),
  }
}

export function ThreeProbe({
  onFrame,
}: { onFrame?: (s: { drawCalls: number; fps: number }) => void }) {
  const { scene, gl } = useThree()
  const ring = useRef(new FrameRing(600))
  const last = useRef(0)
  const prev = useRef(0)
  const tasks = useRef<ReturnType<typeof watchLongTasks> | null>(null)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  useEffect(() => {
    const t = watchLongTasks()
    tasks.current = t
    const w = window as unknown as {
      __LOME_SCENE?: SceneProbe
      __LOME_PERF_RESET?: () => void
      __LOME_THREE?: unknown
    }
    const probe = threeProbe(scene, gl)
    const reset = () => ring.current.reset()
    w.__LOME_SCENE = probe
    w.__LOME_PERF_RESET = reset
    // Debugging only (like __LOME_APP for PlayCanvas): tests read __LOME_SCENE.
    w.__LOME_THREE = { scene, gl }
    return () => {
      t.stop()
      tasks.current = null
      // The canvas unmounts in its own React root, after PlayCanvas may already have put its
      // probe back: clear only what this renderer set.
      if (w.__LOME_SCENE === probe) w.__LOME_SCENE = undefined
      if (w.__LOME_PERF_RESET === reset) w.__LOME_PERF_RESET = undefined
      w.__LOME_THREE = undefined
    }
  }, [scene, gl])

  useFrame(() => {
    const now = performance.now()
    if (prev.current) ring.current.push(now - prev.current)
    prev.current = now
    if (now - last.current < 500) return
    last.current = now
    let meshes = 0
    let animated = 0
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) animated++
    })
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    const size = gl.getDrawingBufferSize(new THREE.Vector2())
    const snap: PerfSnapshot = {
      at: Math.round(now),
      frame: ring.current.summary(),
      // gl.info is reset when a frame starts rendering: read here, it holds the previous frame.
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      renderEntities: meshes,
      meshInstances: meshes,
      animated,
      animating: animated,
      heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
      longTasks: tasks.current?.count() ?? 0,
      longTaskMs: tasks.current?.totalMs() ?? 0,
      renders: {},
      assets: gl.info.memory.geometries,
      pixelRatio: gl.getPixelRatio(),
      resolution: [size.x, size.y],
    }
    ;(window as unknown as { __LOME_PERF?: PerfSnapshot }).__LOME_PERF = snap
    onFrameRef.current?.({ drawCalls: snap.drawCalls, fps: snap.frame.fps })
  })
  return null
}
