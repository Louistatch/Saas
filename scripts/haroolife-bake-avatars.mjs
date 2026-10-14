#!/usr/bin/env node
/**
 * Bakes Microsoft Rocketbox avatars (MIT) into one game-ready GLB per avatar for HarooLife:
 * the rigged body with its textures (downsized), plus the animation clips the game uses,
 * merged onto the body's skeleton by bone name and made in-place.
 *
 *   FBX2GLTF=/path/to/FBX2glTF node scripts/haroolife-bake-avatars.mjs <rocketbox-dir> <out-dir>
 *
 * <rocketbox-dir> is a checkout of https://github.com/microsoft/Microsoft-Rocketbox (only the
 * avatars and clips listed below need to be present). FBX2glTF is the Facebook/Oculus converter
 * (npm package `fbx2gltf` ships a Linux binary); ImageMagick `convert` must be on the PATH for
 * the TGA textures. Dev tool, run by hand: its output is committed, nothing runs at build time.
 *
 * Output per avatar: <out-dir>/<id>.glb, Y-up, metres, feet at the origin, KHR_mesh_quantization
 * (decoded natively by PlayCanvas and three.js), textures 1024² JPEG (hair alpha 512² PNG).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, quantize, resample } from '@gltf-transform/functions'

const [srcDir, outDir] = process.argv.slice(2)
const FBX2GLTF = process.env.FBX2GLTF
if (!srcDir || !outDir || !FBX2GLTF) {
  console.error('usage: FBX2GLTF=<binary> haroolife-bake-avatars.mjs <rocketbox-dir> <out-dir>')
  process.exit(1)
}

/** Avatars shipped: Rocketbox adults with African features, picked by eye from the catalogue. */
const AVATARS = [
  { id: 'rb-male-04', source: 'Male_Adult_04', sex: 'm' },
  { id: 'rb-male-12', source: 'Male_Adult_12', sex: 'm' },
  { id: 'rb-male-18', source: 'Male_Adult_18', sex: 'm' },
  { id: 'rb-female-party-02', source: 'Female_Party_02', sex: 'f' },
]

/**
 * Game clip name → Rocketbox clip (without the m_/f_ prefix and the .max.fbx suffix). Clips with
 * root motion (walk, run, turn, sit) are made in-place below: the game moves the body itself.
 */
const CLIPS = {
  idle: 'idle_breathe_01',
  walk: 'walk_neutral_01',
  run: 'run_neutral_01',
  'turn-left': 'turn_left_60_to_walk',
  'turn-right': 'turn_right_60_to_walk',
  'sit-down': 'sit_down_chair_01',
  sit: 'sit_chair_idle_neutral_01',
  'stand-up': 'sit_stand_up_chair_01',
  talk: 'gestic_talk_neutral_01',
  listen: 'gestic_listen_neutral_01',
  wave: 'wave_01',
  door: 'try_door_inwards',
  'phone-talk': 'cell_phone_talk_01',
  'phone-text': 'cell_phone_textmessage',
}
/** Clips that loop; the others play once and hold their last frame. */
export const LOOPING = new Set([
  'idle',
  'walk',
  'run',
  'sit',
  'talk',
  'listen',
  'phone-talk',
  'phone-text',
])
/**
 * Rocketbox records 30–40 s of the conversational and seated clips; the game loops them, and
 * 8 s is enough variety for a figure seen from the street. Keeping the whole take made each
 * avatar ≈ 2.7 MB of animation; this cut brings it under 1 MB.
 */
const MAX_SECONDS = 8

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'haroolife-avatars-'))
fs.mkdirSync(outDir, { recursive: true })

function fbxToGlb(fbx, name) {
  const out = path.join(tmp, name)
  execFileSync(FBX2GLTF, ['-i', fbx, '-o', out, '--binary'], { stdio: 'pipe' })
  return `${out}.glb`
}
function findClip(sex, clip) {
  const name = `${sex}_${clip}.max.fbx`
  const root = path.join(srcDir, 'Assets', 'Animations')
  // The in-place ("static") variant when it exists, else a root-motion one (made in-place later).
  for (const dir of [
    'all_animations_max_motextr_static',
    'all_animations_max_motextr_xy',
    'all_animations_max_motextr_xyz',
  ]) {
    const p = path.join(root, dir, name)
    if (fs.existsSync(p)) return p
  }
  throw new Error(`clip not found: ${name}`)
}
function convertTexture(tga, kind) {
  const out = path.join(tmp, `${path.basename(tga, '.tga')}.${kind === 'opacity' ? 'png' : 'jpg'}`)
  const args =
    kind === 'opacity'
      ? [tga, '-resize', '512x512', '-strip', `PNG32:${out}`]
      : [tga, '-resize', '1024x1024', '-strip', '-quality', kind === 'color' ? '88' : '85', out]
  execFileSync('convert', args, { stdio: 'pipe' })
  return out
}

/** Attaches the avatar's textures: <prefix>_body_*, <prefix>_head_*, <prefix>_opacity_color. */
function attachTextures(doc, texDir) {
  const files = fs.readdirSync(texDir).filter((f) => f.endsWith('.tga'))
  const byName = new Map(files.map((f) => [f.replace(/\.tga$/, ''), path.join(texDir, f)]))
  const texture = (name, kind) => {
    const src = byName.get(name)
    if (!src) return null
    const converted = convertTexture(src, kind)
    return doc
      .createTexture(name)
      .setImage(fs.readFileSync(converted))
      .setMimeType(kind === 'opacity' ? 'image/png' : 'image/jpeg')
  }
  for (const material of doc.getRoot().listMaterials()) {
    const m = /^(.+)_(body|head|opacity)$/.exec(material.getName())
    if (!m) continue
    const [, prefix, part] = m
    material.setMetallicFactor(0).setRoughnessFactor(0.72)
    if (part === 'opacity') {
      // Hair, eyelashes, eyebrows: colour with alpha, cut out rather than blended (cheap, sorted).
      const t = texture(`${prefix}_opacity_color`, 'opacity')
      if (t) material.setBaseColorTexture(t)
      material.setAlphaMode('MASK').setAlphaCutoff(0.5).setDoubleSided(true)
      continue
    }
    const color = texture(`${prefix}_${part}_color`, 'color')
    if (color) material.setBaseColorTexture(color)
    const normal = texture(`${prefix}_${part}_normal`, 'normal')
    if (normal) material.setNormalTexture(normal)
  }
}

/**
 * Copies the clip's animation into the avatar document, retargeting each channel to the avatar
 * node of the same name. The skeleton root's horizontal motion is removed so the clip plays in
 * place; its vertical motion (sitting down) is kept.
 */
function mergeClip(avatar, clipDoc, name) {
  const nodes = new Map(
    avatar
      .getRoot()
      .listNodes()
      .map((n) => [n.getName(), n]),
  )
  const src = clipDoc.getRoot().listAnimations()[0]
  if (!src) throw new Error(`no animation in ${name}`)
  const anim = avatar.createAnimation(name)
  const buffer = avatar.getRoot().listBuffers()[0]
  const copyAccessor = (a) =>
    avatar.createAccessor().setType(a.getType()).setArray(a.getArray().slice()).setBuffer(buffer)
  let channels = 0
  for (const channel of src.listChannels()) {
    const targetName = channel.getTargetNode()?.getName()
    const target = targetName ? nodes.get(targetName) : null
    if (!target) continue
    const sampler = channel.getSampler()
    const output = copyAccessor(sampler.getOutput())
    const input = copyAccessor(sampler.getInput())
    if (sampler.getInterpolation() !== 'CUBICSPLINE') {
      const times = input.getArray()
      let keep = times.length
      while (keep > 1 && times[keep - 1] > MAX_SECONDS) keep--
      if (keep < times.length) {
        input.setArray(times.slice(0, keep))
        output.setArray(output.getArray().slice(0, keep * output.getElementSize()))
      }
    }
    if (targetName === 'Bip01' && channel.getTargetPath() === 'translation') {
      const arr = output.getArray()
      const x0 = arr[0]
      const z0 = arr[2]
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = x0
        arr[i + 2] = z0
      }
      output.setArray(arr)
    }
    const s = avatar
      .createAnimationSampler()
      .setInput(input)
      .setOutput(output)
      .setInterpolation(sampler.getInterpolation())
    anim.addSampler(s)
    anim.addChannel(
      avatar
        .createAnimationChannel()
        .setTargetNode(target)
        .setTargetPath(channel.getTargetPath())
        .setSampler(s),
    )
    channels++
  }
  return channels
}

for (const spec of AVATARS) {
  const avatarDir = path.join(srcDir, 'Assets', 'Avatars', 'Adults', spec.source)
  const fbx = path.join(avatarDir, 'Export', `${spec.source}.fbx`)
  if (!fs.existsSync(fbx)) {
    console.error(`skip ${spec.id}: ${fbx} missing`)
    continue
  }
  const doc = await io.read(fbxToGlb(fbx, spec.id))
  doc.getRoot().getAsset().copyright =
    'Microsoft Rocketbox Avatar Library (MIT) — github.com/microsoft/Microsoft-Rocketbox'
  // The converter leaves an empty 'Take 001' on static models.
  for (const a of doc.getRoot().listAnimations()) if (a.listChannels().length === 0) a.dispose()
  attachTextures(doc, path.join(avatarDir, 'Textures'))
  // Some exports carry FBX vertex colours; three.js multiplies them into the base colour.
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives())
      for (const semantic of prim.listSemantics())
        if (semantic.startsWith('COLOR_')) prim.setAttribute(semantic, null)
  const report = []
  for (const [name, clip] of Object.entries(CLIPS)) {
    const clipDoc = await io.read(fbxToGlb(findClip(spec.sex, clip), `${spec.id}-${name}`))
    report.push(`${name}:${mergeClip(doc, clipDoc, name)}`)
  }
  await doc.transform(resample({ tolerance: 5e-4 }), dedup(), prune(), quantize())
  const out = path.join(outDir, `${spec.id}.glb`)
  await io.write(out, doc)
  const root = doc.getRoot()
  let tris = 0
  for (const mesh of root.listMeshes())
    for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3
  console.log(
    `${spec.id}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${tris} tris, ${root.listSkins()[0]?.listJoints().length} joints, ${root.listTextures().length} textures, clips ${report.join(' ')}`,
  )
}
fs.rmSync(tmp, { recursive: true, force: true })
