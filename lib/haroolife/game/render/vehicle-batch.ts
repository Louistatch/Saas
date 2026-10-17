import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Bake the static traffic GLBs by material, preserving UVs, normals and every triangle.
 * Player/remote wheels remain independent: this is only the already rigid NPC circulation.
 * Materials/textures belong to the original GLTF; only the merged geometries are owned here.
 */
export function batchTrafficModel(source: THREE.Object3D): THREE.Group {
  source.updateMatrixWorld(true)
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const shadows = new Map<THREE.Material, { cast: boolean; receive: boolean }>()
  source.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    // The bundled Kenney GLBs have one material per mesh. Refuse to silently lose groups.
    if (Array.isArray(mesh.material) || (mesh as THREE.SkinnedMesh).isSkinnedMesh)
      throw new Error('Non-rigid traffic model')
    const list = byMaterial.get(mesh.material) ?? []
    list.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld))
    byMaterial.set(mesh.material, list)
    const previous = shadows.get(mesh.material)
    shadows.set(mesh.material, {
      cast: mesh.castShadow || !!previous?.cast,
      receive: mesh.receiveShadow || !!previous?.receive,
    })
  })
  const root = new THREE.Group()
  for (const [material, parts] of byMaterial) {
    const merged = mergeGeometries(parts)
    for (const g of parts) g.dispose()
    if (!merged) throw new Error('Incompatible traffic geometry')
    merged.computeBoundingSphere()
    const mesh = new THREE.Mesh(merged, material)
    mesh.castShadow = shadows.get(material)?.cast ?? false
    mesh.receiveShadow = shadows.get(material)?.receive ?? false
    root.add(mesh)
  }
  return root
}

export function disposeTrafficModel(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) mesh.geometry.dispose()
  })
}
