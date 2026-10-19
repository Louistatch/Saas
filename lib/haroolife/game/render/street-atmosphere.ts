import * as THREE from 'three'

/**
 * Lomé's sky and air for the street: a gradient sky (deep blue overhead, hazy white at the
 * horizon, warm ground), the image-based lighting drawn from it (paint, glass and metal reflect
 * the sky instead of a flat colour), and the dry-season haze that softens what is far away.
 * Everything is generated: no texture to download. The environment is recomputed only when the
 * light changes by a step (dawn, day, dusk, night), never every frame. The reflections cost every
 * pixel a few texture reads: they are for the « Élevé » quality only (measured: the frame time
 * doubled under software rendering); the sky and the haze stay at every level.
 */
const DAY = { zenith: '#4f8fd0', horizon: '#e4e3d6', ground: '#9a7a58' }
const NIGHT = { zenith: '#070c1c', horizon: '#26304b', ground: '#1b1814' }
/** Daylight buckets: the environment is rebuilt only when the bucket changes. */
const STEPS = 6

const mix = (a: string, b: string, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k)

function skyCanvas(k: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 256
  const g = c.getContext('2d')
  if (!g) return c
  const zenith = mix(NIGHT.zenith, DAY.zenith, k)
  const horizon = mix(NIGHT.horizon, DAY.horizon, k)
  const ground = mix(NIGHT.ground, DAY.ground, k)
  // Equirectangular: top row is straight up, the middle is the horizon, the bottom the ground.
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, `#${zenith.getHexString()}`)
  grad.addColorStop(0.38, `#${zenith.clone().lerp(horizon, 0.55).getHexString()}`)
  grad.addColorStop(0.5, `#${horizon.getHexString()}`)
  grad.addColorStop(0.53, `#${horizon.clone().lerp(ground, 0.6).getHexString()}`)
  grad.addColorStop(1, `#${ground.getHexString()}`)
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 256)
  return c
}

export class StreetAtmosphere {
  private readonly pmrem: THREE.PMREMGenerator
  private sky: THREE.CanvasTexture | null = null
  private env: THREE.WebGLRenderTarget | null = null
  private step = -1
  private on = false
  readonly fog: THREE.Fog

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    /** View depth of the look-at point: the haze starts just beyond it. */
    cameraDistance: number,
  ) {
    this.pmrem = new THREE.PMREMGenerator(renderer)
    this.fog = new THREE.Fog(DAY.horizon, cameraDistance + 6, cameraDistance + 85)
    scene.fog = this.fog
  }

  /** Whether paint, glass and metal reflect the sky (image lighting). */
  get reflections(): boolean {
    return this.on
  }
  set reflections(on: boolean) {
    if (on === this.on) return
    this.on = on
    const step = this.step
    this.step = -1
    if (step >= 0) this.setDaylight(step / STEPS)
  }

  /** `k` from 0 (night) to 1 (full day). */
  setDaylight(k: number): void {
    this.fog.color.copy(mix(NIGHT.horizon, DAY.horizon, k))
    const step = Math.round(k * STEPS)
    if (step === this.step) return
    this.step = step
    const sky = new THREE.CanvasTexture(skyCanvas(step / STEPS))
    sky.mapping = THREE.EquirectangularReflectionMapping
    sky.colorSpace = THREE.SRGBColorSpace
    const env = this.on ? this.pmrem.fromEquirectangular(sky) : null
    this.scene.background = sky
    this.scene.environment = env?.texture ?? null
    // Reflections bright by day, faint at night (the street lights take over).
    this.scene.environmentIntensity = 0.25 + 0.75 * (step / STEPS)
    this.sky?.dispose()
    this.env?.dispose()
    this.sky = sky
    this.env = env
  }

  dispose(): void {
    this.scene.fog = null
    this.scene.environment = null
    this.scene.background = null
    this.sky?.dispose()
    this.env?.dispose()
    this.pmrem.dispose()
  }
}

/**
 * A tileable grain for the ground: soft patches of dust, dry grass or worn asphalt. Tiny (32 px,
 * smoothed by the texture filter), drawn once per kind; repeated `repeat` times across a cell, so
 * a texel stays about 12 cm on the real-scale street.
 */
export function groundGrain(
  seed: number,
  contrast: number,
  speckles: number,
  repeat = 1,
): THREE.CanvasTexture {
  const size = 32
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')
  let s = seed
  const rand = () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  if (g) {
    const img = g.createImageData(size, size)
    for (let i = 0; i < size * size; i++) {
      // Grey around white: the material colour stays the base, the grain only modulates it.
      const v = 255 - rand() * 255 * contrast - (rand() < speckles ? 40 * rand() : 0)
      img.data[i * 4] = v
      img.data[i * 4 + 1] = v
      img.data[i * 4 + 2] = v
      img.data[i * 4 + 3] = 255
    }
    g.putImageData(img, 0, 0)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 2
  return t
}

/**
 * Part of the city's buildings come from a pastel kit (mint roofs, lavender walls). Lomé's are
 * weathered plaster, ochre and grey sheet metal: those vertex colours are graded in the shader,
 * partly desaturated, warmed and given back some contrast. Pure arithmetic, no texture. Vertices
 * with an alpha of 0 (Lomé's own models, already in their real colours) are left as they are; the
 * material is opaque, so the alpha only carries that flag.
 */
export function gradeLomeColours(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 c = mix(vec3(l), diffuseColor.rgb, 0.42);
        c *= vec3(1.07, 0.97, 0.84);
        c = clamp((c - 0.45) * 1.12 + 0.43, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, c, step(0.5, vColor.a));
        diffuseColor.a = opacity;
      }`,
    )
  }
  material.customProgramCacheKey = () => 'lome-grade'
}
