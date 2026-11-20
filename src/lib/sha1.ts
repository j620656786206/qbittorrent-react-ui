// AR-56, NFR-9: SHA-1 in plain JS. At home the app runs over plain http,
// where `crypto.subtle` does not exist (it is secure-context only), so the
// info hash never uses a browser or Node crypto API. RFC 3174 / FIPS 180-4.

export interface Sha1 {
  /** Feeds more bytes; any chunking gives the same digest. */
  update: (bytes: Uint8Array) => void
  /** Finishes and returns the digest as lowercase 40-char hex. */
  digestHex: () => string
}

const BLOCK_BYTES = 64

export function createSha1(): Sha1 {
  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0
  const block = new Uint8Array(BLOCK_BYTES)
  const w = new Int32Array(80)
  let blockLength = 0
  let totalBytes = 0
  let done = false

  function compress(bytes: Uint8Array, offset: number): void {
    for (let i = 0; i < 16; i++) {
      const at = offset + i * 4
      w[i] =
        (bytes[at] << 24) |
        (bytes[at + 1] << 16) |
        (bytes[at + 2] << 8) |
        bytes[at + 3]
    }
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]
      w[i] = (x << 1) | (x >>> 31)
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    for (let i = 0; i < 80; i++) {
      let f: number
      let k: number
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0
      e = d
      d = c
      c = (b << 30) | (b >>> 2)
      b = a
      a = temp
    }
    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
  }

  function update(bytes: Uint8Array): void {
    if (done) throw new Error('sha1: update after digestHex')
    totalBytes += bytes.length
    let offset = 0
    if (blockLength > 0) {
      const take = Math.min(BLOCK_BYTES - blockLength, bytes.length)
      block.set(bytes.subarray(0, take), blockLength)
      blockLength += take
      offset = take
      if (blockLength < BLOCK_BYTES) return
      compress(block, 0)
      blockLength = 0
    }
    for (; offset + BLOCK_BYTES <= bytes.length; offset += BLOCK_BYTES) {
      compress(bytes, offset)
    }
    if (offset < bytes.length) {
      block.set(bytes.subarray(offset), 0)
      blockLength = bytes.length - offset
    }
  }

  function digestHex(): string {
    if (done) throw new Error('sha1: digestHex called twice')
    const bitsHigh = Math.floor(totalBytes / 0x20000000)
    const bitsLow = (totalBytes * 8) >>> 0
    const padLength =
      blockLength < 56 ? 56 - blockLength : BLOCK_BYTES + 56 - blockLength
    const tail = new Uint8Array(padLength + 8)
    tail[0] = 0x80
    const view = new DataView(tail.buffer)
    view.setUint32(padLength, bitsHigh)
    view.setUint32(padLength + 4, bitsLow)
    update(tail)
    done = true
    return [h0, h1, h2, h3, h4]
      .map((word) => (word >>> 0).toString(16).padStart(8, '0'))
      .join('')
  }

  return { update, digestHex }
}

export function sha1Hex(bytes: Uint8Array): string {
  const sha1 = createSha1()
  sha1.update(bytes)
  return sha1.digestHex()
}
