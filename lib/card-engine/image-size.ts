/**
 * Proportions d'une image à partir de son en-tête, sans la décoder.
 *
 * La carte choisit l'emplacement d'un logo d'après son rapport largeur/hauteur :
 * un logo carré ou rond va dans le disque du sceau, un logotype large va dans
 * un cartouche. Ce module lit ce rapport dans une data URL (PNG, JPEG, GIF,
 * WebP, SVG) ; il fonctionne à l'identique dans le navigateur et sur le serveur.
 */

function decodeDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:([^;,]+)((?:;[^,]*)*),([\s\S]*)$/.exec(dataUrl)
  if (!m) return null
  const mime = m[1].toLowerCase()
  const isBase64 = /;base64/i.test(m[2])
  const payload = m[3]
  try {
    if (isBase64) {
      const bin = atob(payload.replace(/\s+/g, ''))
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return { mime, bytes }
    }
    return { mime, bytes: new TextEncoder().encode(decodeURIComponent(payload)) }
  } catch {
    return null
  }
}

function u16be(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1]
}
function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
}
function u16le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8)
}
function u24le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)
}

function ascii(b: Uint8Array, o: number, n: number): string {
  let s = ''
  for (let i = 0; i < n; i++) s += String.fromCharCode(b[o + i])
  return s
}

function pngSize(b: Uint8Array): [number, number] | null {
  if (b.length < 24 || ascii(b, 1, 3) !== 'PNG') return null
  return [u32be(b, 16), u32be(b, 20)]
}

function gifSize(b: Uint8Array): [number, number] | null {
  if (b.length < 10 || ascii(b, 0, 3) !== 'GIF') return null
  return [u16le(b, 6), u16le(b, 8)]
}

function jpegSize(b: Uint8Array): [number, number] | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let o = 2
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) {
      o++
      continue
    }
    const marker = b[o + 1]
    if (marker === 0xff) {
      o++
      continue
    }
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) return [u16be(b, o + 7), u16be(b, o + 5)]
    o += 2 + u16be(b, o + 2)
  }
  return null
}

function webpSize(b: Uint8Array): [number, number] | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null
  const kind = ascii(b, 12, 4)
  if (kind === 'VP8 ') return [u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff]
  if (kind === 'VP8L') {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1]
  }
  if (kind === 'VP8X') return [u24le(b, 24) + 1, u24le(b, 27) + 1]
  return null
}

function svgSize(b: Uint8Array): [number, number] | null {
  const head = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 4096)))
  const tag = /<svg\b[^>]*>/i.exec(head)?.[0]
  if (!tag) return null
  const num = (name: string): number | null => {
    const m = new RegExp(
      `\\s${name}\\s*=\\s*["']\\s*([0-9.]+)\\s*(px|pt|mm|cm|in|em)?\\s*["']`,
      'i',
    ).exec(tag)
    return m ? Number.parseFloat(m[1]) : null
  }
  const w = num('width')
  const h = num('height')
  if (w && h) return [w, h]
  const vb =
    /viewBox\s*=\s*["']\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*["']/i.exec(tag)
  return vb ? [Number.parseFloat(vb[1]), Number.parseFloat(vb[2])] : null
}

/** Largeur et hauteur en pixels (ou unités SVG), `null` si le format n'est pas reconnu. */
export function imageSizeFromDataUrl(dataUrl: string | null | undefined): [number, number] | null {
  if (!dataUrl?.startsWith('data:')) return null
  const decoded = decodeDataUrl(dataUrl)
  if (!decoded) return null
  const { mime, bytes } = decoded
  const size = mime.includes('svg')
    ? svgSize(bytes)
    : (pngSize(bytes) ?? jpegSize(bytes) ?? gifSize(bytes) ?? webpSize(bytes) ?? svgSize(bytes))
  if (!size || size[0] <= 0 || size[1] <= 0) return null
  return size
}

/** Rapport largeur / hauteur, `null` si inconnu. */
export function imageAspectFromDataUrl(dataUrl: string | null | undefined): number | null {
  const size = imageSizeFromDataUrl(dataUrl)
  return size ? size[0] / size[1] : null
}
