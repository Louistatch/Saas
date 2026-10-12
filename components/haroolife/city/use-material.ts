'use client'

import { deviceAlive } from '@/lib/haroolife/city/gpu'
import { useApp } from '@playcanvas/react/hooks'
import * as pc from 'playcanvas'
import { useLayoutEffect, useMemo } from 'react'

export type MaterialProps = {
  diffuse?: string
  emissive?: string
  gloss?: number
  metalness?: number
  opacity?: number
}

/**
 * Drop-in replacement for `useMaterial` from @playcanvas/react.
 *
 * The library hook destroys its StandardMaterial in a layout-effect cleanup. On unmount React
 * runs layout cleanups parent first, so the `<Application>` has already destroyed the WebGL
 * device (`device.gl === null`) when the material releases its uniform buffer: that is the
 * production crash `Cannot read properties of null (reading 'deleteBuffer')`. Here the release
 * is idempotent: once the device is gone its buffers are already freed, so the material is
 * simply dropped.
 */
export function useMaterial(props: MaterialProps): pc.StandardMaterial {
  const app = useApp()
  const material = useMemo(() => new pc.StandardMaterial(), [])
  const { diffuse, emissive, gloss, metalness, opacity } = props
  useLayoutEffect(() => {
    if (diffuse) material.diffuse.fromString(diffuse)
    if (emissive) material.emissive.fromString(emissive)
    if (gloss !== undefined) material.gloss = gloss
    if (metalness !== undefined) material.metalness = metalness
    if (opacity !== undefined) {
      material.opacity = opacity
      material.blendType = opacity < 1 ? pc.BLEND_NORMAL : pc.BLEND_NONE
    }
    material.update()
  }, [material, diffuse, emissive, gloss, metalness, opacity])
  useLayoutEffect(
    () => () => {
      if (deviceAlive(app?.graphicsDevice)) material.destroy()
    },
    [material, app],
  )
  return material
}
