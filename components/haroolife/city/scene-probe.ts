import type { SceneProbe } from '@/lib/haroolife/engine/types'
/**
 * `window.__LOME_SCENE` for the PlayCanvas renderer: the engine-neutral test view of the scene
 * (see lib/haroolife/engine/types.ts). Read-only; nothing here changes the scene.
 */
import type * as pc from 'playcanvas'

type Vram = { tex: number; vb: number; ib: number }

export function playCanvasProbe(app: pc.AppBase): SceneProbe {
  const find = (name: string) => app.root.findByName(name) as pc.Entity | null
  return {
    engine: 'playcanvas',
    has: (name) => Boolean(find(name)),
    childNames: (name) => {
      const e = find(name)
      return e ? e.children.map((c) => c.name) : null
    },
    position: (name) => {
      const e = find(name)
      if (!e) return null
      const p = e.getPosition()
      return { x: p.x, y: p.y, z: p.z }
    },
    count: () => app.root.find(() => true).length,
    geometry: (pattern) => {
      const re = new RegExp(pattern)
      let matches = 0
      let triangles = 0
      const walk = (e: pc.GraphNode, inside: boolean) => {
        const mine = re.test(e.name)
        if (mine) matches++
        const here = inside || mine
        const render = (e as pc.Entity).render
        if (here && render)
          for (const mi of render.meshInstances)
            triangles += Math.floor((mi.mesh?.primitive[0]?.count ?? 0) / 3)
        for (const c of e.children) walk(c, here)
      }
      walk(app.root, false)
      return { matches, triangles }
    },
    gpu: () => {
      const device = app.graphicsDevice as unknown as {
        textures?: Set<unknown>
        buffers?: Set<unknown>
        _vram?: Vram
      }
      const mb = (v: number) => Math.round(v / 1048576)
      return {
        textures: device.textures?.size ?? -1,
        buffers: device.buffers?.size ?? -1,
        vramMB: device._vram
          ? { tex: mb(device._vram.tex), vb: mb(device._vram.vb), ib: mb(device._vram.ib) }
          : null,
      }
    },
  }
}
