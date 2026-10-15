'use client'

/**
 * Interiors drawn by PlayCanvas, the way back kept behind `?engine=playcanvas`. Its own chunk:
 * the street, the map, the trip and the default interiors are drawn by the HarooLife engine
 * (Three.js) and never download or start PlayCanvas.
 */
import type { Layout, NpcAnim, Prop } from '@/lib/haroolife/city/interiors'
import { FrameRing, type PerfSnapshot, renders, watchLongTasks } from '@/lib/haroolife/city/perf'
import { PRESETS, type Quality, renderPixelRatio } from '@/lib/haroolife/city/quality'
import { Application } from '@playcanvas/react'
import { useApp, useAppEvent } from '@playcanvas/react/hooks'
import type * as pc from 'playcanvas'
import { useEffect, useRef, useState } from 'react'
import InteriorScene from './interior-scene'
import { playCanvasProbe } from './scene-probe'

function QualityController({ quality }: { quality: Quality }) {
  const app = useApp()
  useEffect(() => {
    if (!app) return
    app.graphicsDevice.maxPixelRatio = renderPixelRatio(quality)
    // Never app.resizeCanvas() here: this child effect runs before the wrapper sets the fill
    // mode, and the engine's default (keep aspect of the 300×150 canvas) would pin the inline
    // style to a 2:1 strip. The CSS size stays 100 %, only the backbuffer follows the preset.
    const canvas = app.graphicsDevice.canvas
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    app.updateCanvasSize()
  }, [app, quality])
  return null
}

/** Frame statistics for the debug hook, the statistics overlay and the e2e performance scenarios. */
function StatsProbe({ onFrame }: { onFrame: (s: { drawCalls: number; fps: number }) => void }) {
  const app = useApp()
  const last = useRef(0)
  const ring = useRef(new FrameRing(600))
  // One observer for the probe's lifetime. `useRef(watchLongTasks())` evaluated its argument on
  // every render and leaked a new, never-disconnected PerformanceObserver each time.
  const tasks = useRef<ReturnType<typeof watchLongTasks> | null>(null)
  useEffect(() => {
    const t = watchLongTasks()
    tasks.current = t
    return () => {
      t.stop()
      tasks.current = null
    }
  }, [])
  useEffect(() => {
    if (!app) return
    const w = window as unknown as {
      __LOME_PERF_RESET?: () => void
      __LOME_APP?: unknown
      __LOME_SCENE?: unknown
    }
    w.__LOME_PERF_RESET = () => ring.current.reset()
    // Debugging only: tests read the engine-neutral __LOME_SCENE.
    w.__LOME_APP = app
    w.__LOME_SCENE = playCanvasProbe(app)
    return () => {
      w.__LOME_PERF_RESET = undefined
      w.__LOME_APP = undefined
      w.__LOME_SCENE = undefined
    }
  }, [app])
  const prev = useRef(0)
  useAppEvent('update', () => {
    if (!app) return
    const now = performance.now()
    if (prev.current) ring.current.push(now - prev.current)
    prev.current = now
    if (now - last.current < 500) return
    last.current = now
    const stats = app.stats as unknown as {
      drawCalls: { total: number }
      frame: { fps: number; triangles: number }
    }
    let renderEntities = 0
    let meshInstances = 0
    let animated = 0
    let animating = 0
    let triangles = 0
    app.root.forEach((e) => {
      const ent = e as pc.Entity
      if (ent.render) {
        renderEntities++
        const list = ent.render.meshInstances ?? []
        meshInstances += list.length
        for (const mi of list) {
          if (!mi.visible || !ent.enabled) continue
          const prim = mi.mesh?.primitive?.[0]
          if (prim) triangles += Math.floor(prim.count / 3)
        }
      }
      if (ent.anim) {
        animated++
        if (ent.anim.playing) animating++
      }
    })
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    const snap: PerfSnapshot = {
      at: Math.round(now),
      frame: ring.current.summary(),
      drawCalls: stats.drawCalls.total,
      triangles: Number.isFinite(stats.frame.triangles) ? stats.frame.triangles : triangles,
      renderEntities,
      meshInstances,
      animated,
      animating,
      heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
      longTasks: tasks.current?.count() ?? 0,
      longTaskMs: tasks.current?.totalMs() ?? 0,
      renders: { ...renders },
      assets: app.assets.list().filter((a) => a.loaded).length,
      pixelRatio: app.graphicsDevice.maxPixelRatio,
      resolution: [app.graphicsDevice.width, app.graphicsDevice.height],
    }
    ;(window as unknown as { __LOME_PERF?: PerfSnapshot }).__LOME_PERF = snap
    onFrame({ drawCalls: snap.drawCalls, fps: snap.frame.fps })
  })
  return null
}

export default function PlayCanvasInterior({
  layout,
  title,
  angle,
  activity,
  playerModel,
  playerPagne,
  onUse,
  quality,
  onFrame,
}: {
  layout: Layout
  title: string
  angle: number
  activity: { prop: string; anim: NpcAnim } | null
  playerModel: string
  playerPagne?: string
  onUse: (p: Prop) => void
  quality: Quality
  onFrame?: (s: { drawCalls: number; fps: number }) => void
}) {
  // Antialiasing is fixed when the WebGL context is created; the quality governor only changes
  // the resolution afterwards.
  const [antialias] = useState(PRESETS[quality].antialias)
  return (
    <Application
      graphicsDeviceOptions={{ antialias }}
      className="h-full w-full"
      style={{ width: '100%', height: '100%' }}
    >
      {onFrame && <StatsProbe onFrame={onFrame} />}
      <QualityController quality={quality} />
      <InteriorScene
        layout={layout}
        title={title}
        angle={angle}
        distance={24}
        activity={activity}
        playerModel={playerModel}
        playerPagne={playerPagne}
        onUse={onUse}
      />
    </Application>
  )
}
