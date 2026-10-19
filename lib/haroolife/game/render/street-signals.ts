import * as THREE from 'three'
import { type RoadQuery, isJunction, signalPhase, signalWorks } from '../../city/pedestrians'

/** Shared instanced geometry: six draw calls for every visible intersection's actual 3D lights. */
export class StreetSignals {
  private heads: { x: number; z: number; axis: 'x' | 'z'; junction: { x: number; z: number } }[] =
    []
  private bulbs: THREE.InstancedMesh[] = []
  private last = ''
  constructor(
    group: THREE.Group,
    roads: { x: number; y: number }[],
    road: RoadQuery,
    box: THREE.BoxGeometry,
    material: (color: string) => THREE.MeshStandardMaterial,
    unit: number,
  ) {
    for (const p of roads) {
      if (!isJunction(p.x, p.y, road)) continue
      const anchor = new THREE.Group()
      anchor.name = `Feu tricolore ${p.x}:${p.y}`
      anchor.position.set(p.x * unit, 0, p.y * unit)
      group.add(anchor)
      for (const [sx, sz] of [
        [-1, -1],
        [1, 1],
      ] as const)
        this.heads.push({
          x: (p.x + sx * 0.79) * unit,
          z: (p.y + sz * 0.79) * unit,
          axis: sx === -1 ? 'x' : 'z',
          junction: { x: p.x, z: p.y },
        })
    }
    if (!this.heads.length) return
    const matrix = new THREE.Matrix4()
    const posts = new THREE.InstancedMesh(box, material('#303b3c'), this.heads.length * 2)
    posts.name = 'Feux · poteaux et boîtiers'
    for (const [i, p] of this.heads.entries()) {
      matrix.makeScale(0.07, 2.2, 0.07).setPosition(p.x, 1.1, p.z)
      posts.setMatrixAt(i * 2, matrix)
      matrix.makeScale(0.24, 0.72, 0.24).setPosition(p.x, 2.15, p.z)
      posts.setMatrixAt(i * 2 + 1, matrix)
    }
    group.add(posts)
    for (const [i, color] of ['#ff574c', '#ffc149', '#2bdd83', '#e64f52', '#35eea2'].entries()) {
      const mesh = new THREE.InstancedMesh(box, material(color), this.heads.length)
      mesh.name =
        i < 3
          ? `Feux · ${['rouge', 'orange', 'vert'][i]}`
          : `Piétons · ${i === 3 ? 'rouge' : 'vert'}`
      group.add(mesh)
      this.bulbs.push(mesh)
    }
  }
  update(seconds: number, repaired: boolean) {
    const phase = signalPhase(seconds)
    const blink = Math.floor(seconds * 2) % 2 === 0
    const key = `${phase.x}:${phase.z}:${phase.pedestrian}:${blink}:${repaired}`
    if (key === this.last) return
    this.last = key
    const m = new THREE.Matrix4()
    for (const [i, p] of this.heads.entries()) {
      const works = signalWorks(p.junction, repaired)
      for (let color = 0; color < this.bulbs.length; color++) {
        const lit =
          color < 3
            ? works
              ? phase[p.axis] === ['red', 'amber', 'green'][color]
              : color === 1 && blink
            : works
              ? phase.pedestrian === (color === 4)
              : false
        const side = p.axis === 'x'
        m.makeScale(lit ? 0.14 : 0, lit ? 0.14 : 0, lit ? 0.14 : 0).setPosition(
          p.x + (side ? 0.14 : 0),
          color < 3 ? 2.37 - color * 0.21 : 1.55,
          p.z + (side ? 0 : 0.14),
        )
        this.bulbs[color].setMatrixAt(i, m)
      }
    }
    for (const b of this.bulbs) {
      b.instanceMatrix.needsUpdate = true
      b.computeBoundingSphere()
    }
  }
}
