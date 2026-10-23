import type * as THREE from 'three'

/**
 * Wind in Lomé's trees, after Slop New York's trees (mrdoob, MIT): a sway weight is baked per
 * vertex when the city is merged (the crown moves, the foot of the trunk stays put) and the vertex
 * shader bends those vertices with a slow, gusting sea breeze whose phase follows the position, so
 * neighbouring trees never move in step. Costs one byte per vertex and a few instructions per
 * vertex; the shadow map keeps the trees still (it is only redrawn on chosen frames).
 */

/** How far each species bends: the coconut palm's fronds most, the mango's dense crown least. */
export const SWAY: Readonly<Record<string, number>> = {
  'lome-cocotier': 1,
  'lome-neem': 0.7,
  'lome-manguier': 0.5,
  // The kit's trees, still used for the player's own park and yard.
  palm: 1,
  tree: 0.55,
  'tree-small': 0.55,
  'tree-large': 0.35,
  oak: 0.35,
  bush: 0.25,
}

/**
 * Bend at the top of the tallest palm (scene units, about 1.5 m each) for a full gust: enough to
 * be seen from the street's camera on a phone, where a gentler breeze went unnoticed.
 */
export const WIND_REACH = 1.1

/**
 * Sway weight of a vertex, 0 to 1: the species' flexibility times the square of its height in the
 * model (a trunk bends from the ground up, the crown carries the motion).
 */
export function swayWeight(species: number, height: number): number {
  const h = Math.min(1, Math.max(0, height))
  return Math.min(1, Math.max(0, species)) * h * h
}

export interface Wind {
  /** Seconds, advanced by the frame loop. */
  readonly time: { value: number }
  /** Bend at weight 1 (scene units); 0 stills every tree (reduced motion). */
  readonly reach: { value: number }
}

export function createWind(): Wind {
  const still =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return { time: { value: 0 }, reach: { value: still ? 0 : WIND_REACH } }
}

/**
 * The breeze the shader applies, in plain arithmetic for the tests: a steady sway with a faster
 * flutter, scaled by gusts that come and go over half a minute.
 */
export function windOffset(
  time: number,
  x: number,
  z: number,
  weight: number,
  reach: number,
): [number, number] {
  const phase = x * 0.21 + z * 0.17
  const gust = 0.7 + 0.3 * Math.sin(time * 0.23 + phase * 0.05) * Math.sin(time * 0.11 + 1.7)
  const bend = weight * reach * gust
  return [
    bend * (0.8 * Math.sin(time * 1.6 + phase) + 0.2 * Math.sin(time * 3.7 + phase * 2.3)),
    bend * 0.5 * Math.sin(time * 1.2 + phase * 1.4),
  ]
}

/** Adds the breeze to a material that already has its own shader patch (the Lomé colour grade). */
export function addWind(material: THREE.Material, wind: Wind): void {
  const before = material.onBeforeCompile
  const key = material.customProgramCacheKey
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer)
    shader.uniforms.uWindTime = wind.time
    shader.uniforms.uWindReach = wind.reach
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float sway;
        uniform float uWindTime;
        uniform float uWindReach;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        if (sway > 0.0 && uWindReach > 0.0) {
          vec4 windAt = modelMatrix * vec4(transformed, 1.0);
          float phase = windAt.x * 0.21 + windAt.z * 0.17;
          float gust = 0.7 + 0.3 * sin(uWindTime * 0.23 + phase * 0.05) * sin(uWindTime * 0.11 + 1.7);
          float bend = sway * uWindReach * gust;
          transformed.x += bend * (0.8 * sin(uWindTime * 1.6 + phase) + 0.2 * sin(uWindTime * 3.7 + phase * 2.3));
          transformed.z += bend * 0.5 * sin(uWindTime * 1.2 + phase * 1.4);
        }`,
      )
  }
  material.customProgramCacheKey = () => `${key.call(material)}|wind`
  material.needsUpdate = true
}
