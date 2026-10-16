import * as THREE from 'three'

/** Compact sedan: 4.1 × 1.7 × 1.45 m against a 1.75 m adult, within one street lane. */
export function fitTaxiModel(model: THREE.Object3D, figure: number, streetWidth: number): void {
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
  const k = figure / 1.75
  model.scale.set(
    Math.min(1.7 * k, streetWidth * 0.6) / size.x,
    (1.45 * k) / size.y,
    (4.1 * k) / size.z,
  )
  const fitted = new THREE.Box3().setFromObject(model)
  model.position.y -= fitted.min.y
}
