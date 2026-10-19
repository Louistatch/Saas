import type { Bank } from '@/lib/haroolife/city/bank'
import * as THREE from 'three'
import { modelGeometry } from './street-poles'
import { fitVehicleModel } from './vehicle-scale'

/** The existing licensed CC0 ambulance, shared by local dispatch and remote passengers. */
export class AmbulanceModels {
  private readonly geometry: THREE.BufferGeometry
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })
  private readonly lightGeometry = new THREE.CylinderGeometry(0.09, 0.09, 0.13, 8)
  private readonly lightMaterial = new THREE.MeshBasicMaterial({ color: '#55baff' })
  private readonly lights = new WeakMap<THREE.Object3D, THREE.Mesh[]>()
  constructor(bank: Bank) {
    this.geometry = modelGeometry(bank.model('ambulance'))
  }
  create(): THREE.Group {
    const root = new THREE.Group()
    const model = new THREE.Mesh(this.geometry, this.material)
    model.castShadow = true
    model.receiveShadow = true
    root.add(model)
    fitVehicleModel(model, 1.15, 5, 5.4)
    const box = new THREE.Box3().setFromObject(model)
    const lights: THREE.Mesh[] = []
    for (const x of [-0.32, 0.32]) {
      const light = new THREE.Mesh(this.lightGeometry, this.lightMaterial)
      light.position.set(x, box.max.y + 0.04, 0.35)
      root.add(light)
      lights.push(light)
    }
    this.lights.set(root, lights)
    return root
  }
  flash(root: THREE.Object3D, seconds: number): void {
    const lights = this.lights.get(root)
    if (!lights) return
    for (let i = 0; i < lights.length; i++) lights[i].visible = Math.floor(seconds * 4) % 2 === i
  }
  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
    this.lightGeometry.dispose()
    this.lightMaterial.dispose()
  }
}

/** Three small cones on the pavement: two instanced draws, never a road-blocking collider. */
export class MunicipalWorksite {
  readonly root = new THREE.Group()
  private readonly cone = new THREE.ConeGeometry(0.13, 0.4, 8)
  private readonly foot = new THREE.BoxGeometry(0.32, 0.04, 0.32)
  private readonly orange = new THREE.MeshStandardMaterial({ color: '#f58b27', roughness: 0.9 })
  private readonly black = new THREE.MeshStandardMaterial({ color: '#263c38', roughness: 0.95 })
  private readonly instances: THREE.InstancedMesh[] = []
  constructor(x: number, z: number, unit: number) {
    this.root.name = 'Chantier du maire'
    this.root.position.set((x + 0.72) * unit, 0.07, (z + 0.72) * unit)
    const matrix = new THREE.Matrix4()
    for (const [geometry, material, height] of [
      [this.cone, this.orange, 0.22],
      [this.foot, this.black, 0.02],
    ] as const) {
      const mesh = new THREE.InstancedMesh(geometry, material, 3)
      for (let i = 0; i < 3; i++)
        mesh.setMatrixAt(i, matrix.makeTranslation((i - 1) * 0.5, height, 0))
      mesh.castShadow = true
      this.root.add(mesh)
      this.instances.push(mesh)
    }
  }
  dispose(): void {
    this.root.removeFromParent()
    for (const mesh of this.instances) mesh.dispose()
    this.cone.dispose()
    this.foot.dispose()
    this.orange.dispose()
    this.black.dispose()
  }
}
