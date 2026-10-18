import * as THREE from 'three'

/** Every compact car, including the player's and remote taxis, uses the traffic scale. */
export const TRAFFIC_CAR_SCALE = 0.78
export const TRAFFIC_LANE_SCALE = 0.67

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

/**
 * A real-proportion model (vehicle-models.ts): one uniform scale from its length, so the body
 * keeps its shape; only the width is narrowed when it would not fit the lane.
 */
export function fitVehicleModel(
  model: THREE.Object3D,
  figure: number,
  streetWidth: number,
  length: number,
): void {
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
  const s = (length * (figure / 1.75)) / size.z
  model.scale.set(Math.min(s, (streetWidth * 0.6) / size.x), s, s)
  const fitted = new THREE.Box3().setFromObject(model)
  model.position.y -= fitted.min.y
}
