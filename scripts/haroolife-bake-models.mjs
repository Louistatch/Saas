#!/usr/bin/env node
/**
 * Bakes CC0 Kenney glTF-binary models into a compact vertex-coloured pack for the Lomé
 * city renderer. Each model's colormap texture is sampled per vertex, so the city can
 * merge hundreds of buildings into one mesh per chunk (no textures, no extra draw calls).
 *
 *   node scripts/haroolife-bake-models.mjs <kits-dir> <out-dir>
 *
 * <kits-dir> holds one folder per kit (city-commercial, city-suburban, …) with the .glb
 * files and the kit's Textures/colormap.png. Output: kenney-pack.bin + kenney-pack.json.
 * Sources: https://kenney.nl (CC0 1.0), mirrored at github.com/shorepine/kenney.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const [kitsDir, outDir] = process.argv.slice(2)
if (!kitsDir || !outDir) {
  console.error('usage: haroolife-bake-models.mjs <kits-dir> <out-dir>')
  process.exit(1)
}

/** key → [kit, file]. Keys are what the catalogue refers to. */
const MODELS = {
  // City Kit — Commercial (shops, offices, blocks)
  ...Object.fromEntries(
    'abcdefghijklmn'.split('').map((c) => [`com-${c}`, ['city-commercial', `building-${c}`]]),
  ),
  awning: ['city-commercial', 'detail-awning'],
  'awning-wide': ['city-commercial', 'detail-awning-wide'],
  overhang: ['city-commercial', 'detail-overhang'],
  'overhang-wide': ['city-commercial', 'detail-overhang-wide'],
  // City Kit — Commercial, V3: a few towers kept for named landmarks, market parasols
  ...Object.fromEntries(
    'abcde'.split('').map((c) => [`sky-${c}`, ['city-commercial', `building-skyscraper-${c}`]]),
  ),
  'parasol-a': ['city-commercial', 'detail-parasol-a'],
  'parasol-b': ['city-commercial', 'detail-parasol-b'],
  // City Kit — Industrial, V3 (the port and industrial zone)
  ...Object.fromEntries(
    'ehijklms'.split('').map((c) => [`ind-${c}`, ['city-industrial', `building-${c}`]]),
  ),
  'tank-large': ['city-industrial', 'detail-tank-large'],
  tank: ['city-industrial', 'detail-tank'],
  'container-a': ['city-industrial', 'shipping-container-a'],
  'container-b': ['city-industrial', 'shipping-container-b'],
  'container-c': ['city-industrial', 'shipping-container-c'],
  'water-tower': ['city-industrial', 'water-tower'],
  chimney: ['city-industrial', 'chimney-large'],
  // City Kit — Suburban (houses, villas)
  ...Object.fromEntries(
    'abcdefghijklmnopqrstu'
      .split('')
      .map((c) => [`sub-${c}`, ['city-suburban', `building-type-${c}`]]),
  ),
  'fence-2': ['city-suburban', 'fence-1x2'],
  'fence-3': ['city-suburban', 'fence-1x3'],
  'fence-4': ['city-suburban', 'fence-1x4'],
  'fence-low': ['city-suburban', 'fence-low'],
  planter: ['city-suburban', 'planter'],
  'tree-large': ['city-suburban', 'tree-large'],
  'tree-small': ['city-suburban', 'tree-small'],
  path: ['city-suburban', 'path-short'],
  driveway: ['city-suburban', 'driveway-short'],
  // City Kit — Roads (street furniture)
  'lamp-curved': ['city-roads', 'light-curved'],
  'lamp-double': ['city-roads', 'light-curved-double'],
  'lamp-square': ['city-roads', 'light-square'],
  cone: ['city-roads', 'construction-cone'],
  barrier: ['city-roads', 'construction-barrier'],
  'road-sign': ['city-roads', 'road-sign-street'],
  // Mini Market (stalls and goods)
  'display-fruit': ['mini-market', 'display-fruit'],
  'display-bread': ['mini-market', 'display-bread'],
  'cash-register': ['mini-market', 'cash-register'],
  freezer: ['mini-market', 'freezer'],
  'shopping-cart': ['mini-market', 'shopping-cart'],
  // Car Kit (vehicles)
  taxi: ['car', 'taxi'],
  sedan: ['car', 'sedan'],
  van: ['car', 'van'],
  suv: ['car', 'suv'],
  hatchback: ['car', 'hatchback-sports'],
  delivery: ['car', 'delivery'],
  truck: ['car', 'truck'],
  ambulance: ['car', 'ambulance'],
  police: ['car', 'police'],
  // Mini Characters in bind pose: static stand-ins for far pedestrians (no skinning)
  'npc-a': ['mini-characters', 'character-female-a'],
  'npc-b': ['mini-characters', 'character-male-a'],
  'npc-c': ['mini-characters', 'character-female-c'],
  'npc-d': ['mini-characters', 'character-male-c'],
  // Nature Kit (vertex colours / material colours only)
  palm: ['nature', 'tree-palm'],
  oak: ['nature', 'tree-oak'],
  tree: ['nature', 'tree-default'],
  bush: ['nature', 'plant-bush'],
}

const textureCache = new Map()
async function colormap(kit) {
  if (textureCache.has(kit)) return textureCache.get(kit)
  const file = path.join(kitsDir, kit, 'Textures', 'colormap.png')
  if (!fs.existsSync(file)) {
    textureCache.set(kit, null)
    return null
  }
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true })
  const tex = { data, w: info.width, h: info.height, ch: info.channels }
  textureCache.set(kit, tex)
  return tex
}
/** glTF texture space: (0,0) is the top-left texel. Verified against PlayCanvas renders of the
 * same models (vertex-count histograms are misleading: large faces have few vertices). */
function sample(tex, u, v) {
  const x = Math.min(tex.w - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * tex.w)))
  const y = Math.min(tex.h - 1, Math.max(0, Math.floor((((v % 1) + 1) % 1) * tex.h)))
  const i = (y * tex.w + x) * tex.ch
  return [tex.data[i], tex.data[i + 1], tex.data[i + 2]]
}

function parseGlb(file) {
  const b = fs.readFileSync(file)
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`)
  const jsonLen = b.readUInt32LE(12)
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'))
  const binLen = b.readUInt32LE(20 + jsonLen)
  const bin = b.subarray(28 + jsonLen, 28 + jsonLen + binLen)
  return { json, bin }
}
const SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
function readAccessor(glb, index) {
  const a = glb.json.accessors[index]
  const bv = glb.json.bufferViews[a.bufferView]
  const n = SIZES[a.type]
  const ctor =
    a.componentType === 5126
      ? Float32Array
      : a.componentType === 5125
        ? Uint32Array
        : a.componentType === 5123
          ? Uint16Array
          : a.componentType === 5121
            ? Uint8Array
            : a.componentType === 5122
              ? Int16Array
              : Int8Array
  const elem = ctor.BYTES_PER_ELEMENT
  const stride = bv.byteStride ?? n * elem
  const base = glb.bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0)
  const out = new Float64Array(a.count * n)
  const view = new DataView(glb.bin.buffer)
  const get = {
    [Float32Array]: (o) => view.getFloat32(o, true),
    [Uint32Array]: (o) => view.getUint32(o, true),
    [Uint16Array]: (o) => view.getUint16(o, true),
    [Uint8Array]: (o) => view.getUint8(o),
    [Int16Array]: (o) => view.getInt16(o, true),
    [Int8Array]: (o) => view.getInt8(o),
  }[ctor]
  const norm = a.normalized
    ? ctor === Uint16Array
      ? 65535
      : ctor === Uint8Array
        ? 255
        : ctor === Int16Array
          ? 32767
          : ctor === Int8Array
            ? 127
            : 1
    : 1
  for (let i = 0; i < a.count; i++)
    for (let k = 0; k < n; k++) out[i * n + k] = get(base + i * stride + k * elem) / norm
  return { data: out, count: a.count, n }
}

// Minimal column-major 4×4 helpers.
const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
function mul(a, b) {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}
function trs(node) {
  if (node.matrix) return node.matrix
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const xx = qx * qx
  const yy = qy * qy
  const zz = qz * qz
  const xy = qx * qy
  const xz = qx * qz
  const yz = qy * qz
  const wx = qw * qx
  const wy = qw * qy
  const wz = qw * qz
  return [
    (1 - 2 * (yy + zz)) * sx,
    2 * (xy + wz) * sx,
    2 * (xz - wy) * sx,
    0,
    2 * (xy - wz) * sy,
    (1 - 2 * (xx + zz)) * sy,
    2 * (yz + wx) * sy,
    0,
    2 * (xz + wy) * sz,
    2 * (yz - wx) * sz,
    (1 - 2 * (xx + yy)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ]
}
const xformP = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
]
const xformN = (m, x, y, z) => {
  const v = [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z,
  ]
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

async function bake(kit, name) {
  const file = path.join(kitsDir, kit, `${name}.glb`)
  const glb = parseGlb(file)
  const tex = await colormap(kit)
  const pos = []
  const nrm = []
  const col = []
  const idx = []
  const visit = (ni, parent) => {
    const node = glb.json.nodes[ni]
    const m = mul(parent, trs(node))
    if (node.mesh !== undefined) {
      for (const prim of glb.json.meshes[node.mesh].primitives) {
        if (prim.mode !== undefined && prim.mode !== 4) continue
        const P = readAccessor(glb, prim.attributes.POSITION)
        const N =
          prim.attributes.NORMAL !== undefined ? readAccessor(glb, prim.attributes.NORMAL) : null
        const UV =
          prim.attributes.TEXCOORD_0 !== undefined
            ? readAccessor(glb, prim.attributes.TEXCOORD_0)
            : null
        const C0 =
          prim.attributes.COLOR_0 !== undefined ? readAccessor(glb, prim.attributes.COLOR_0) : null
        const mat = prim.material !== undefined ? glb.json.materials[prim.material] : null
        const pbr = mat?.pbrMetallicRoughness ?? {}
        const factor = pbr.baseColorFactor ?? [1, 1, 1, 1]
        const useTex = pbr.baseColorTexture !== undefined && tex && UV
        const base = pos.length / 3
        for (let i = 0; i < P.count; i++) {
          const p = xformP(m, P.data[i * 3], P.data[i * 3 + 1], P.data[i * 3 + 2])
          pos.push(p[0], p[1], p[2])
          const n = N ? xformN(m, N.data[i * 3], N.data[i * 3 + 1], N.data[i * 3 + 2]) : [0, 1, 0]
          nrm.push(n[0], n[1], n[2])
          let c = useTex
            ? sample(tex, UV.data[i * 2], UV.data[i * 2 + 1]).map((v) => v / 255)
            : [1, 1, 1]
          c = [c[0] * factor[0], c[1] * factor[1], c[2] * factor[2]]
          if (C0)
            c = [
              c[0] * C0.data[i * C0.n],
              c[1] * C0.data[i * C0.n + 1],
              c[2] * C0.data[i * C0.n + 2],
            ]
          col.push(c[0], c[1], c[2])
        }
        if (prim.indices !== undefined) {
          const I = readAccessor(glb, prim.indices)
          for (let i = 0; i < I.count; i++) idx.push(base + I.data[i])
        } else for (let i = 0; i < P.count; i++) idx.push(base + i)
      }
    }
    for (const c of node.children ?? []) visit(c, m)
  }
  const scene = glb.json.scenes[glb.json.scene ?? 0]
  for (const n of scene.nodes) visit(n, I4())
  // Drop sub-floor geometry noise and recentre on the ground plane.
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  for (let i = 0; i < pos.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k])
      max[k] = Math.max(max[k], pos[i + k])
    }
  return { pos, nrm, col, idx, min, max, source: `${kit}/${name}.glb` }
}

const manifest = { version: 1, license: 'CC0-1.0 (Kenney, kenney.nl)', models: {} }
const chunks = []
let offset = 0
const align = (n) => (n + 3) & ~3
for (const [key, [kit, name]] of Object.entries(MODELS)) {
  const m = await bake(kit, name)
  const verts = m.pos.length / 3
  const extent = Math.max(...m.min.map(Math.abs), ...m.max.map(Math.abs)) || 1
  const scale = extent / 32767
  const P = new Int16Array(verts * 3)
  for (let i = 0; i < P.length; i++) P[i] = Math.round(m.pos[i] / scale)
  const N = new Int8Array(verts * 3)
  for (let i = 0; i < N.length; i++) N[i] = Math.round(m.nrm[i] * 127)
  const C = new Uint8Array(verts * 3)
  for (let i = 0; i < C.length; i++) C[i] = Math.round(Math.min(1, Math.max(0, m.col[i])) * 255)
  const I = verts > 65535 ? new Uint32Array(m.idx) : new Uint16Array(m.idx)
  const parts = [P, N, C, I].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength))
  const entry = {
    off: offset,
    verts,
    tris: m.idx.length / 3,
    scale,
    min: m.min,
    max: m.max,
    src: m.source,
  }
  entry.layout = {}
  let o = offset
  for (const [k, p] of [
    ['pos', 0],
    ['nrm', 1],
    ['col', 2],
    ['idx', 3],
  ]) {
    entry.layout[k] = o
    chunks.push(parts[p])
    o += parts[p].length
    const pad = align(o) - o
    if (pad) chunks.push(Buffer.alloc(pad))
    o += pad
  }
  entry.wide = verts > 65535
  offset = o
  manifest.models[key] = entry
}
fs.mkdirSync(outDir, { recursive: true })
const bin = Buffer.concat(chunks)
// Build fingerprint of the binary: written into the manifest and into the client, which loads
// the pack under ?v=<build> and rejects a cached manifest of another build (stale CDN or
// browser cache after a re-bake). See components/haroolife/city/model-bank.ts.
manifest.build = createHash('sha256').update(bin).digest('hex').slice(0, 12)
fs.writeFileSync(path.join(outDir, 'kenney-pack.bin'), bin)
fs.writeFileSync(path.join(outDir, 'kenney-pack.json'), JSON.stringify(manifest))
fs.writeFileSync(
  new URL('../lib/haroolife/city/pack-version.ts', import.meta.url),
  `/** Build of public/haroolife/city/kenney-pack.* — written by scripts/haroolife-bake-models.mjs. */\nexport const PACK_BUILD = '${manifest.build}'\n`,
)
const tri = Object.values(manifest.models).reduce((s, m) => s + m.tris, 0)
console.log(
  `${Object.keys(manifest.models).length} models, ${tri} triangles, ${Math.round(bin.length / 1024)} KB`,
)
