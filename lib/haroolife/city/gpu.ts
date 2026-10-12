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
