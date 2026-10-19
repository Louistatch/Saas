/**
 * The player's plot in the street (« Ma maison », city/homebuild.ts), drawn stage by stage on its
 * « Terrain disponible » lot: the plot with its sign « Ce terrain n'est pas à vendre », then the
 * slab, the grey block walls with their rebar waiting for a floor, the corrugated iron roof, the
 * door and windows, the plaster and the CEET meter, the paint. Scaffolding stands while a paid
 * stage is under way. Simple boxes, in the street's soft palette; one group, removed with the
 * neighbourhood window.
 */
import type { Lot } from '@/lib/haroolife/city/world'
import * as THREE from 'three'

export interface StreetPlot {
  lotId: string
  /** What the place is called on its door and sheet: « Mon terrain », « Ma maison »… */
  name: string
  /** Stages finished (0 to 6). */
  built: number
  /** A paid stage is under way. */
  working: boolean
}

const BLOCK = '#8d8f8a'
const PLASTER = '#d8d2c4'
const PAINT = '#e9c46a'
const SLAB = '#a3a39b'
const IRON = '#9aa3a6'
const WOOD = '#6b4226'
const GLASS = '#3d5a6c'
const POLE = '#8a6a43'
const SAND = '#d9b77c'
const REBAR = '#4a3f38'

/** The sign every Lomé plot owner paints: drawn once per street, shared by its plot. */
export function signTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 160
  const ctx = c.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#f4efe2'
    ctx.fillRect(0, 0, 256, 160)
    ctx.fillStyle = '#b3261e'
    ctx.font = 'bold 34px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('CE TERRAIN', 128, 48)
    ctx.fillText('N’EST PAS', 128, 92)
    ctx.fillText('À VENDRE', 128, 136)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Which side of the lot its door (road cell) is on: the house faces it. */
function facing(lot: Lot): number {
  const d = lot.door
  if (d.y >= lot.y + lot.h) return 0
  if (d.y < lot.y) return Math.PI
  if (d.x >= lot.x + lot.w) return Math.PI / 2
  return -Math.PI / 2
}

/**
 * The plot at its stage: a group centred on the lot, facing its door. `mat` gives the street's
 * shared materials, `box` its unit box; `sign` the sign's material.
 */
export function buildPlotGroup(
  lot: Lot,
  plot: StreetPlot,
  cell: number,
  mat: (color: string) => THREE.Material,
  box: THREE.BufferGeometry,
  sign: THREE.Material,
): THREE.Group {
  const g = new THREE.Group()
  g.name = `chantier:${lot.id}`
  g.position.set((lot.x + (lot.w - 1) / 2) * cell, 0, (lot.y + (lot.h - 1) / 2) * cell)
  const yaw = facing(lot)
  g.rotation.y = yaw
  const side = Math.abs(Math.sin(yaw)) > 0.5
  const W = (side ? lot.h : lot.w) * cell * 0.85
  const D = (side ? lot.w : lot.h) * cell * 0.7
  const H = 2.2
  const T = 0.18
  const add = (
    color: string | THREE.Material,
    sx: number,
    sy: number,
    sz: number,
    x: number,
    y: number,
    z: number,
    name: string,
  ) => {
    const m = new THREE.Mesh(box, typeof color === 'string' ? mat(color) : color)
    m.scale.set(sx, sy, sz)
    m.position.set(x, y, z)
    m.castShadow = true
    m.receiveShadow = true
    m.name = name
    g.add(m)
    return m
  }
  const b = plot.built
  // The sign stands inside the plot, between the house and the road.
  const front = D / 2 + 0.2
  // The sign, by the road, until the house is finished.
  if (b < 6) {
    add(REBAR, 0.06, 1.3, 0.06, -W / 2 + 0.3, 0.65, front, 'panneau-poteau')
    add(sign, 0.9, 0.56, 0.04, -W / 2 + 0.3, 1.4, front, 'panneau')
  }
  // Bare land: a heap of sand and a stack of blocks waiting.
  if (b === 0) {
    add(SAND, 0.9, 0.35, 0.9, W / 4, 0.18, 0, 'sable')
    add(BLOCK, 0.6, 0.4, 0.4, -W / 4, 0.2, -D / 4, 'parpaings')
  }
  // The slab.
  if (b >= 1) add(SLAB, W + 0.2, 0.2, D + 0.2, 0, 0.1, 0, 'dalle')
  // The walls: grey blocks, then plaster, then paint; a gap in the front for the door.
  if (b >= 2) {
    const wall = b >= 6 ? PAINT : b >= 5 ? PLASTER : BLOCK
    const y = 0.2 + H / 2
    const gap = 0.8
    add(wall, W, H, T, 0, y, -D / 2, 'mur')
    add(wall, T, H, D, -W / 2, y, 0, 'mur')
    add(wall, T, H, D, W / 2, y, 0, 'mur')
    const part = (W - gap) / 2
    add(wall, part, H, T, -(gap + part) / 2, y, D / 2, 'mur')
    add(wall, part, H, T, (gap + part) / 2, y, D / 2, 'mur')
    add(wall, gap, 0.4, T, 0, 0.2 + H - 0.2, D / 2, 'mur')
    // Rebar out of the corners, waiting for the roof (or a floor, one day).
    if (b === 2)
      for (const [x, z] of [
        [-W / 2, -D / 2],
        [W / 2, -D / 2],
        [-W / 2, D / 2],
        [W / 2, D / 2],
      ])
        add(REBAR, 0.05, 0.6, 0.05, x, 0.2 + H + 0.3, z, 'fer')
  }
  // The corrugated iron roof, gently sloped to the back.
  if (b >= 3) {
    const roof = add(IRON, W + 0.5, 0.1, D + 0.6, 0, 0.2 + H + 0.25, 0, 'toit')
    roof.rotation.x = -0.12
  }
  // Door and windows; the CEET meter once plastered.
  if (b >= 4) {
    add(WOOD, 0.75, 1.8, 0.08, 0, 0.2 + 0.9, D / 2 + T / 2, 'porte')
    add(GLASS, 0.7, 0.6, 0.06, -W / 4 - 0.2, 0.2 + 1.5, D / 2 + T / 2, 'fenetre')
    add(GLASS, 0.7, 0.6, 0.06, W / 4 + 0.2, 0.2 + 1.5, D / 2 + T / 2, 'fenetre')
  }
  if (b >= 5) add('#f2f2ee', 0.3, 0.4, 0.12, W / 2 + T, 0.2 + 1.4, D / 4, 'compteur-ceet')
  // Scaffolding while the mason works.
  if (plot.working)
    for (const [x, z] of [
      [-W / 2 - 0.35, -D / 2 - 0.35],
      [W / 2 + 0.35, -D / 2 - 0.35],
      [-W / 2 - 0.35, D / 2 + 0.35],
      [W / 2 + 0.35, D / 2 + 0.35],
    ])
      add(POLE, 0.08, H + 0.8, 0.08, x, (H + 0.8) / 2, z, 'echafaudage')
  return g
}
