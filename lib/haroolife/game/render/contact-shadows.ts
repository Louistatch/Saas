import * as THREE from 'three'

/**
 * Grounding for people and vehicles, including when mobile quality disables shadow maps.
 * One bounded instanced draw, two triangles per footprint, no texture or offscreen pass.
 * This is a soft contact cue; the existing sun still casts the directional shadows.
 */
export class ContactShadows {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private readonly transform = new THREE.Object3D()
  private used = 0

  constructor(private readonly capacity = 64) {
    const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { strength: { value: 0.28 } },
      vertexShader: `
        varying vec2 footprint;
        void main() {
          footprint = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float strength;
        varying vec2 footprint;
        void main() {
          float a = 1.0 - smoothstep(0.08, 1.0, length(footprint));
          gl_FragColor = vec4(0.06, 0.045, 0.03, a * a * strength);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity)
    this.mesh.name = 'Ombres de contact'
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // Moving instances have no static aggregate bound. Their number and range are bounded
    // by the street; avoid recomputing a bounding sphere over the entire buffer each frame.
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.visible = false
    this.mesh.matrixAutoUpdate = false
  }

  begin(daylight: number, mappedShadows: boolean): void {
    this.used = 0
    this.mesh.material.uniforms.strength.value =
      (mappedShadows ? 0.2 : 0.34) * (0.35 + Math.max(0, Math.min(1, daylight)) * 0.65)
  }

  /** Width and length are full footprint sizes, in the same world units as the model. */
  add(x: number, z: number, floor: number, width: number, length: number, heading = 0): void {
    if (this.used >= this.capacity) return
    const t = this.transform
    t.position.set(x, floor, z)
    t.rotation.y = heading
    t.scale.set(width, 1, length)
    t.updateMatrix()
    this.mesh.setMatrixAt(this.used++, t.matrix)
  }

  end(): void {
    this.mesh.count = this.used
    this.mesh.visible = this.used > 0
    if (this.used) {
      this.mesh.instanceMatrix.clearUpdateRanges()
      this.mesh.instanceMatrix.addUpdateRange(0, this.used * 16)
      this.mesh.instanceMatrix.needsUpdate = true
    }
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.dispose()
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
