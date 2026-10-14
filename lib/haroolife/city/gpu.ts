import type * as pc from 'playcanvas'

/**
 * Idempotent GPU release helpers.
 *
 * React runs passive-effect cleanups parent first: on a route change the `<Application>`
 * cleanup destroys the PlayCanvas application (and its WebGL device, whose `gl` becomes
 * null) before the cleanups of the children that created meshes imperatively. A mesh or
 * entity destroyed at that point tries `device.gl.deleteBuffer(...)` on a dead device,
 * which is the production crash `Cannot read properties of null (reading 'deleteBuffer')`.
 * Device destruction already frees every GL object it owns, so releasing after death is
 * simply a no-op here: references are dropped, nothing touches the context.
 */
export function deviceAlive(device: pc.GraphicsDevice | null | undefined): boolean {
  if (!device) return false
  const d = device as unknown as { gl?: unknown; canvas?: HTMLCanvasElement | null }
  return Boolean(d.gl) && Boolean(d.canvas)
}
/** Destroys a mesh only while its device can still delete buffers. */
export function releaseMesh(mesh: pc.Mesh | null | undefined): void {
  if (!mesh) return
  if (deviceAlive(mesh.device)) mesh.destroy()
}
/** Destroys an entity (and its render components) only while its application lives. */
export function releaseEntity(entity: pc.Entity | null | undefined): void {
  if (!entity) return
  const app = (entity as unknown as { _app?: pc.AppBase | null })._app
  if (app && !deviceAlive(app.graphicsDevice)) return
  entity.destroy()
}

/**
 * Destroys a skinned glTF entity (a character) and really frees its bone textures.
 *
 * PlayCanvas 2.23 (`GlbContainerResource.instantiateRenderEntity`) takes two references on the
 * shared `SkinInstance` of a node that has several skinned primitives for every primitive but
 * the first: one when the mesh instance is created, one more when the first `rootBone`
 * assignment clones the skin for the sibling primitives. `entity.destroy()` releases one per
 * primitive, so the instance never reaches zero and its bone texture stays on the device for
 * ever (measured: +1 texture per adult character mounted; the Quaternius adults have four
 * primitives on one skin, the Kenney minis one). The cache is internal, but `rootBone` is
 * public and releases one reference per primitive each time it is cleared: references are
 * dropped that way until the device no longer holds the bone texture. An engine that counts
 * correctly frees it at the first pass, so this stays right after an upgrade.
 */
export function releaseSkinnedEntity(entity: pc.Entity | null | undefined): void {
  if (!entity) return
  const app = (entity as unknown as { _app?: pc.AppBase | null })._app
  if (app && !deviceAlive(app.graphicsDevice)) return
  const textures = (app?.graphicsDevice as unknown as { textures?: Set<unknown> } | undefined)
    ?.textures
  for (const render of entity.findComponents('render') as pc.RenderComponent[]) {
    const bone = render.rootBone
    if (!bone) continue
    const skins = new Map<pc.MeshInstance, pc.SkinInstance>()
    for (const mi of render.meshInstances) if (mi.skinInstance) skins.set(mi, mi.skinInstance)
    if (skins.size === 0) continue
    const held = () => [...skins.values()].some((s) => textures?.has(s.boneTexture))
    for (let pass = 0; pass < 8; pass++) {
      if (pass > 0) {
        for (const [mi, s] of skins) mi.skinInstance = s
        render.rootBone = bone
      }
      render.rootBone = null
      if (!textures || !held()) break
    }
  }
  entity.destroy()
}
