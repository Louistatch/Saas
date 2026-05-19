/**
 * Lightweight, dependency-free QR code generator.
 * Implements QR Code Model 2 with byte mode and selectable error-correction.
 *
 * Adapted from the public-domain pure-JS implementation by Project Nayuki
 * (https://www.nayuki.io/page/qr-code-generator-library).
 *
 * Returns an SVG string (great for canvas drawing via Path2D or as data URL).
 */

const PAD0 = 0xec
const PAD1 = 0x11

export type Ecc = 'L' | 'M' | 'Q' | 'H'
const ECC_FORMAT_BITS: Record<Ecc, number> = { L: 1, M: 0, Q: 3, H: 2 }
const ECC_CODEWORDS_PER_BLOCK: Record<Ecc, number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
}
const NUM_ERROR_CORRECTION_BLOCKS: Record<Ecc, number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
}

class BitBuffer {
  bits: number[] = []
  appendBits(val: number, len: number) {
    if (len < 0 || len > 31 || val >>> len !== 0) throw new Error('bits oob')
    for (let i = len - 1; i >= 0; i--) this.bits.push((val >>> i) & 1)
  }
}

function getNumDataCodewords(ver: number, ecc: Ecc): number {
  return (
    Math.floor(getNumRawDataModules(ver) / 8) -
    ECC_CODEWORDS_PER_BLOCK[ecc][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecc][ver]
  )
}
function getNumRawDataModules(ver: number): number {
  if (ver < 1 || ver > 40) throw new Error('ver oob')
  let result = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2
    result -= (25 * align - 10) * align - 55
    if (ver >= 7) result -= 36
  }
  return result
}

function reedSolomonComputeDivisor(degree: number): number[] {
  const result = new Array(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = reedSolomonMultiply(root, 0x02)
  }
  return result
}
function reedSolomonComputeRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array(divisor.length).fill(0)
  for (const b of data) {
    const factor = b ^ (result.shift() as number)
    result.push(0)
    for (let i = 0; i < divisor.length; i++) {
      result[i] ^= reedSolomonMultiply(divisor[i], factor)
    }
  }
  return result
}
function reedSolomonMultiply(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

function getModeBits() {
  return 4 // byte mode
}
function getNumCharCountBits(ver: number) {
  return ver < 10 ? 8 : 16
}

class QrCode {
  readonly size: number
  readonly modules: boolean[][]
  readonly isFunction: boolean[][]

  constructor(
    readonly version: number,
    readonly ecc: Ecc,
    dataCodewords: number[],
    mask: number,
  ) {
    this.size = version * 4 + 17
    this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(false))
    this.isFunction = Array.from({ length: this.size }, () => new Array(this.size).fill(false))
    this.drawFunctionPatterns()
    const allCodewords = this.addEccAndInterleave(dataCodewords)
    this.drawCodewords(allCodewords)
    this.applyMaskAndFormat(mask)
  }

  private setFn(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark
    this.isFunction[y][x] = true
  }
  private drawFinder(x: number, y: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || xx >= this.size || yy < 0 || yy >= this.size) continue
        this.setFn(xx, yy, dist !== 2 && dist !== 4)
      }
    }
  }
  private drawAlignment(x: number, y: number) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFn(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      }
    }
  }
  private alignmentPositions(): number[] {
    if (this.version === 1) return []
    const numAlign = Math.floor(this.version / 7) + 2
    const step =
      this.version === 32
        ? 26
        : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2
    const result = [6]
    for (let pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos)
    return result
  }
  private drawFunctionPatterns() {
    for (let i = 0; i < this.size; i++) {
      this.setFn(6, i, i % 2 === 0)
      this.setFn(i, 6, i % 2 === 0)
    }
    this.drawFinder(3, 3)
    this.drawFinder(this.size - 4, 3)
    this.drawFinder(3, this.size - 4)
    const aligns = this.alignmentPositions()
    for (let i = 0; i < aligns.length; i++) {
      for (let j = 0; j < aligns.length; j++) {
        if (
          (i === 0 && j === 0) ||
          (i === 0 && j === aligns.length - 1) ||
          (i === aligns.length - 1 && j === 0)
        )
          continue
        this.drawAlignment(aligns[i], aligns[j])
      }
    }
    this.drawFormatBits(0)
    this.drawVersion()
  }
  private drawFormatBits(mask: number) {
    const data = (ECC_FORMAT_BITS[this.ecc] << 3) | mask
    let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const bits = ((data << 10) | rem) ^ 0x5412
    for (let i = 0; i <= 5; i++) this.setFn(8, i, ((bits >>> i) & 1) !== 0)
    this.setFn(8, 7, ((bits >>> 6) & 1) !== 0)
    this.setFn(8, 8, ((bits >>> 7) & 1) !== 0)
    this.setFn(7, 8, ((bits >>> 8) & 1) !== 0)
    for (let i = 9; i < 15; i++) this.setFn(14 - i, 8, ((bits >>> i) & 1) !== 0)
    for (let i = 0; i < 8; i++) this.setFn(this.size - 1 - i, 8, ((bits >>> i) & 1) !== 0)
    for (let i = 8; i < 15; i++) this.setFn(8, this.size - 15 + i, ((bits >>> i) & 1) !== 0)
    this.setFn(8, this.size - 8, true)
  }
  private drawVersion() {
    if (this.version < 7) return
    let rem = this.version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const bits = (this.version << 12) | rem
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) !== 0
      const a = this.size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      this.setFn(a, b, bit)
      this.setFn(b, a, bit)
    }
  }
  private addEccAndInterleave(data: number[]): number[] {
    const ver = this.version
    const ecc = this.ecc
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc][ver]
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecc][ver]
    const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8)
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks)
    const shortBlockLen = Math.floor(rawCodewords / numBlocks)
    const blocks: number[][] = []
    const rsDiv = reedSolomonComputeDivisor(blockEccLen)
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1))
      k += dat.length
      const block = dat.slice()
      const ecc2 = reedSolomonComputeRemainder(dat, rsDiv)
      if (i < numShortBlocks) block.push(0)
      blocks.push(block.concat(ecc2))
    }
    const result: number[] = []
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((b, j) => {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(b[i])
      })
    }
    return result
  }
  private drawCodewords(data: number[]) {
    let i = 0
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j
          const upward = ((right + 1) & 2) === 0
          const y = upward ? this.size - 1 - vert : vert
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0
            i++
          }
        }
      }
    }
  }
  private applyMaskAndFormat(mask: number) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.isFunction[y][x]) continue
        let invert: boolean
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break
          case 1: invert = y % 2 === 0; break
          case 2: invert = x % 3 === 0; break
          case 3: invert = (x + y) % 3 === 0; break
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break
          default: throw new Error('mask oob')
        }
        if (invert) this.modules[y][x] = !this.modules[y][x]
      }
    }
    this.drawFormatBits(mask)
  }
}

function encodeBytes(data: number[], ecc: Ecc): { version: number; codewords: number[] } {
  // Find the smallest version that fits
  let version = 1
  for (; version <= 40; version++) {
    const cap = getNumDataCodewords(version, ecc) * 8
    const needed = 4 + getNumCharCountBits(version) + data.length * 8
    if (needed <= cap) break
  }
  if (version > 40) throw new Error('Data too large for QR')

  const bb = new BitBuffer()
  bb.appendBits(getModeBits(), 4)
  bb.appendBits(data.length, getNumCharCountBits(version))
  for (const b of data) bb.appendBits(b, 8)
  const dataCapBits = getNumDataCodewords(version, ecc) * 8
  bb.appendBits(0, Math.min(4, dataCapBits - bb.bits.length))
  bb.appendBits(0, (8 - (bb.bits.length % 8)) % 8)
  const codewords: number[] = []
  for (let i = 0; i < bb.bits.length; i += 8) {
    let v = 0
    for (let k = 0; k < 8; k++) v = (v << 1) | bb.bits[i + k]
    codewords.push(v)
  }
  for (let p = PAD0; codewords.length < dataCapBits / 8; p ^= PAD0 ^ PAD1) codewords.push(p)
  return { version, codewords }
}

/**
 * Encode a string into a QR code and return its module matrix.
 */
export function encodeText(text: string, ecc: Ecc = 'M'): boolean[][] {
  // UTF-8 encode the string
  let bytes: number[]
  if (typeof TextEncoder !== 'undefined') {
    bytes = Array.from(new TextEncoder().encode(text))
  } else {
    bytes = []
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i)
      if (c < 0x80) bytes.push(c)
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
      else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    }
  }
  const { version, codewords } = encodeBytes(bytes, ecc)
  // Mask 0 is good enough for small payloads; full penalty scoring is omitted for size.
  return new QrCode(version, ecc, codewords, 0).modules
}

/**
 * Render a QR matrix as an SVG string.
 */
export function toSvg(
  matrix: boolean[][],
  opts: { size?: number; margin?: number; color?: string; bg?: string } = {},
): string {
  const { size = 256, margin = 4, color = '#000000', bg = '#ffffff' } = opts
  const n = matrix.length
  const total = n + margin * 2
  let path = ''
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (matrix[y][x]) path += `M${x + margin},${y + margin}h1v1h-1z`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${bg}"/><path d="${path}" fill="${color}"/></svg>`
}

/**
 * Convenience: text → SVG data URL ready for `<img src=...>`.
 */
export function toDataURL(
  text: string,
  opts: { size?: number; margin?: number; color?: string; bg?: string; ecc?: Ecc } = {},
): string {
  const { ecc = 'M', ...rest } = opts
  const matrix = encodeText(text, ecc)
  const svg = toSvg(matrix, rest)
  if (typeof window === 'undefined') {
    const b64 = Buffer.from(svg, 'utf8').toString('base64')
    return `data:image/svg+xml;base64,${b64}`
  }
  // Browser: btoa needs Latin-1 safe input
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

/**
 * Convenience: text → matrix; useful for canvas drawing.
 */
export function toMatrix(text: string, ecc: Ecc = 'M'): boolean[][] {
  return encodeText(text, ecc)
}
