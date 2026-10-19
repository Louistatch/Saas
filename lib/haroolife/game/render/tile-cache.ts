import type { BufferGeometry } from 'three'

/** Bounded inactive LRU. Active scene tiles never compete with this cache or disappear. */
export class TileCache {
  private readonly entries = new Map<
    string,
    { geometry: BufferGeometry; buildings: number; bytes: number }
  >()
  private bytes = 0
  constructor(
    private maxBytes = 12 * 1024 * 1024,
    private readonly maxEntries = 24,
  ) {}

  take(key: string) {
    const item = this.entries.get(key)
    if (!item) return null
    this.entries.delete(key)
    this.bytes -= item.bytes
    return item
  }

  put(key: string, geometry: BufferGeometry, buildings: number): void {
    this.remove(key)
    let bytes = geometry.index?.array.byteLength ?? 0
    for (const attribute of Object.values(geometry.attributes)) bytes += attribute.array.byteLength
    this.entries.set(key, { geometry, buildings, bytes })
    this.bytes += bytes
    this.trim()
  }

  setLimit(bytes: number): void {
    this.maxBytes = bytes
    this.trim()
  }

  private trim(): void {
    while (this.bytes > this.maxBytes || this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.remove(oldest)
    }
  }

  private remove(key: string): void {
    const item = this.entries.get(key)
    if (!item) return
    this.entries.delete(key)
    this.bytes -= item.bytes
    item.geometry.dispose()
  }

  clear(): void {
    for (const key of this.entries.keys()) this.remove(key)
  }

  get byteLength(): number {
    return this.bytes
  }
}
