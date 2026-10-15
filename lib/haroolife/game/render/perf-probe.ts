/**
 * Frame statistics of a HarooLife engine, published as `__LOME_PERF` (the snapshot the diagnostics
 * overlay and the e2e performance scenarios read) with `__LOME_PERF_RESET` to restart the frame
 * window. One per engine instance: the street and the rooms are never on screen together.
 */
import { FrameRing, type PerfSnapshot, renders, watchLongTasks } from '@/lib/haroolife/city/perf'
import * as THREE from 'three'

type PerfWindow = { __LOME_PERF?: PerfSnapshot; __LOME_PERF_RESET?: () => void }

export class PerfProbe {
  private readonly ring = new FrameRing(600)
  private readonly longTasks = watchLongTasks()
  private prev = 0
  private readonly reset = () => this.ring.reset()

  /** Once per drawn frame. */
  frame(now: number): void {
    if (this.prev) this.ring.push(now - this.prev)
    this.prev = now
  }

  /** The tab was hidden: the next frame does not count the time spent away. */
  pause(): void {
    this.prev = 0
  }

  /** Publishes a snapshot of the last drawn frame. */
  publish(
    now: number,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    counts: { animated: number; assets: number },
  ): void {
    let meshes = 0
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.visible) meshes++
    })
    const info = renderer.info
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    const w = window as unknown as PerfWindow
    w.__LOME_PERF = {
      at: Math.round(now),
      frame: this.ring.summary(),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      renderEntities: meshes,
      meshInstances: meshes,
      animated: counts.animated,
      animating: counts.animated,
      heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
      longTasks: this.longTasks.count(),
      longTaskMs: this.longTasks.totalMs(),
      renders: { ...renders },
      assets: counts.assets,
      pixelRatio: renderer.getPixelRatio(),
      resolution: [size.x, size.y],
    }
    w.__LOME_PERF_RESET = this.reset
  }

  /** The engine is disposed: no snapshot of a dead scene is left behind. */
  dispose(): void {
    this.longTasks.stop()
    const w = window as unknown as PerfWindow
    if (w.__LOME_PERF_RESET === this.reset) {
      w.__LOME_PERF_RESET = undefined
      w.__LOME_PERF = undefined
    }
  }
}
