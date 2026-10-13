'use client'

/**
 * Street billboards in the 3D town (D4+, M2): two posts, a frame and a lit poster face drawn on
 * a canvas texture. Supports are built only when the player comes within NEAR cells and freed
 * beyond FAR (a strict GPU budget: one 512×288 texture per built support). The face changes on
 * a timer (rotation), never in the render loop; exposure is sampled 4 times a second.
 */
import {
  type AdCampaign,
  type AdPlacement,
  PLACEMENTS,
  ROTATION_MS,
  campaignFor,
  exposed,
} from '@/lib/haroolife/ads/campaigns'
import type { ExposureTracker } from '@/lib/haroolife/ads/exposure'
import { POSTER_H, POSTER_W, drawPoster, loadPosterImage } from '@/lib/haroolife/ads/poster'
import { deviceAlive, releaseEntity } from '@/lib/haroolife/city/gpu'
import type { PlayerController } from '@/lib/haroolife/city/player'
import { useApp } from '@playcanvas/react/hooks'
import * as pc from 'playcanvas'
import { useEffect, useMemo, useRef, useState } from 'react'
import { worldPos } from './city-chunks'

export const NEAR = 26
export const FAR = 34
const YAW = { N: 180, E: 90, S: 0, W: 270 } as const

export interface AdsDebug {
  built: string[]
  showing: Record<string, string>
  textures: number
  impressions: number
}

function Billboard({ placement, campaign }: { placement: AdPlacement; campaign: AdCampaign }) {
  const app = useApp()
  const face = useRef<{
    tex: pc.Texture
    canvas: HTMLCanvasElement
    mat: pc.StandardMaterial
  } | null>(null)
  const shown = useRef<string | null>(null)

  useEffect(() => {
    if (!app) return
    const device = app.graphicsDevice
    const root = new pc.Entity(`Panneau ${placement.id}`)
    const [x, , z] = worldPos(placement.x, placement.y)
    root.setLocalPosition(x, 0, z)
    root.setLocalEulerAngles(0, YAW[placement.faces], 0)
    const metal = new pc.StandardMaterial()
    metal.diffuse.set(0.22, 0.24, 0.27)
    metal.gloss = 0.5
    metal.update()
    const add = (
      type: 'cylinder' | 'box' | 'plane',
      pos: [number, number, number],
      scale: [number, number, number],
      mat: pc.Material,
    ) => {
      const e = new pc.Entity()
      e.addComponent('render', { type, material: mat, castShadows: false })
      e.setLocalPosition(...pos)
      e.setLocalScale(...scale)
      root.addChild(e)
      return e
    }
    // Square steel posts: 12 triangles each (a cylinder would cost ~20× more for the same look).
    add('box', [-0.72, 0.8, -0.06], [0.09, 1.6, 0.09], metal)
    add('box', [0.72, 0.8, -0.06], [0.09, 1.6, 0.09], metal)
    add('box', [0, 2.05, -0.06], [1.95, 1.2, 0.08], metal)
    const canvas = document.createElement('canvas')
    canvas.width = POSTER_W
    canvas.height = POSTER_H
    const tex = new pc.Texture(device, {
      name: `affiche-${placement.id}`,
      width: POSTER_W,
      height: POSTER_H,
      format: pc.PIXELFORMAT_RGBA8,
      mipmaps: true,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE,
    })
    const mat = new pc.StandardMaterial()
    mat.diffuseMap = tex
    mat.emissiveMap = tex
    // Readable at dusk too: the poster is lit, like a backlit street panel.
    mat.emissive.set(0.55, 0.55, 0.55)
    mat.update()
    const poster = add('plane', [0, 2.05, -0.015], [1.82, 1, 1.04], mat)
    poster.setLocalEulerAngles(90, 0, 0)
    poster.name = `Affiche ${placement.id}`
    app.root.addChild(root)
    face.current = { tex, canvas, mat }
    return () => {
      face.current = null
      shown.current = null
      releaseEntity(root)
      if (deviceAlive(device)) {
        tex.destroy()
        mat.destroy()
        metal.destroy()
      }
    }
  }, [app, placement])

  // Draw the campaign on the face when it changes (at most once per rotation step).
  useEffect(() => {
    const f = face.current
    if (!f || shown.current === `${campaign.id}@${campaign.version}`) return
    shown.current = `${campaign.id}@${campaign.version}`
    drawPoster(f.canvas, campaign)
    f.tex.setSource(f.canvas)
    let cancelled = false
    void loadPosterImage(campaign).then((img) => {
      if (cancelled || !img || face.current !== f) return
      drawPoster(f.canvas, campaign, img)
      f.tex.setSource(f.canvas)
    })
    return () => {
      cancelled = true
    }
  }, [campaign])
  return null
}

export default function Billboards({
  locality,
  campaigns,
  controller,
  tracker,
  onNear,
}: {
  locality: string
  campaigns: AdCampaign[]
  controller: PlayerController
  tracker: ExposureTracker
  /** The support the player stands by (for the « Lire l'annonce » button), or null. */
  onNear: (p: { placement: AdPlacement; campaign: AdCampaign } | null) => void
}) {
  const here = useMemo(() => PLACEMENTS.filter((p) => p.locality === locality), [locality])
  const [built, setBuilt] = useState<string[]>([])
  const [now, setNow] = useState(() => Date.now())
  const impressions = useRef(0)
  const onNearRef = useRef(onNear)
  onNearRef.current = onNear
  const showing = useMemo(() => {
    const m: Record<string, AdCampaign> = {}
    for (const p of here) {
      const c = campaignFor(p, campaigns, now)
      if (c) m[p.id] = c
    }
    return m
  }, [here, campaigns, now])
  const showingRef = useRef(showing)
  showingRef.current = showing

  // Rotation: re-evaluate what each face shows on the rotation boundary (and expiry, at once).
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const wait = ROTATION_MS - (Date.now() % ROTATION_MS)
    let id = 0
    const first = window.setTimeout(() => {
      tick()
      id = window.setInterval(tick, ROTATION_MS)
    }, wait)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(id)
    }
  }, [])

  // Streaming by distance (with hysteresis), proximity and exposure: 4 Hz, off the render loop.
  useEffect(() => {
    let near: string | null = null
    const id = window.setInterval(() => {
      const p = controller.pos
      setBuilt((cur) => {
        const next = here
          .filter((b) => {
            const d = Math.hypot(b.x - p.x, b.y - p.z)
            return cur.includes(b.id) ? d <= FAR : d <= NEAR
          })
          .map((b) => b.id)
        return next.length === cur.length && next.every((x, i) => x === cur[i]) ? cur : next
      })
      // The camera's eye: behind the target along its azimuth (see player.ts cameraBasis).
      const cam = controller.camera
      const a = (cam.angle * Math.PI) / 180
      const back = cam.distance * 0.55
      const eye = {
        x: cam.tx + Math.sin(a) * back,
        z: cam.tz + Math.cos(a) * back,
        angle: cam.angle,
      }
      const visible = here
        .filter((b) => showingRef.current[b.id] && exposed(b, eye))
        .map((b) => ({ campaign: showingRef.current[b.id].id, placement: b.id }))
      impressions.current += tracker.observe(Date.now(), visible)
      // Standing by a support, on foot, on its front side: offer to read it.
      const close = controller.driving
        ? null
        : (here.find((b) => Math.hypot(b.x - p.x, b.y - p.z) <= 2.2 && showingRef.current[b.id]) ??
          null)
      const key = close?.id ?? null
      if (key !== near) {
        near = key
        onNearRef.current(
          close ? { placement: close, campaign: showingRef.current[close.id] } : null,
        )
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [controller, here, tracker])

  useEffect(() => {
    ;(window as unknown as { __LOME_ADS?: AdsDebug }).__LOME_ADS = {
      built,
      showing: Object.fromEntries(Object.entries(showing).map(([k, v]) => [k, v.id])),
      textures: built.length,
      impressions: impressions.current,
    }
  })

  return (
    <>
      {here
        .filter((p) => built.includes(p.id) && showing[p.id])
        .map((p) => (
          <Billboard key={p.id} placement={p} campaign={showing[p.id]} />
        ))}
    </>
  )
}
