import { describe, expect, it } from 'vitest'
import { createSha1, sha1Hex } from '#/lib/sha1'

// Spec 4.5 H1, H2: the FIPS 180 / RFC 3174 vectors, and the same data fed in
// uneven chunks.

const ascii = (text: string) => new TextEncoder().encode(text)
const VECTOR_448 = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'
const MIB = 1024 * 1024

describe('H1 standard vectors', () => {
  it.each([
    ['empty', ascii(''), 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
    ['abc', ascii('abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d'],
    ['448-bit', ascii(VECTOR_448), '84983e441c3bd26ebaae4aa1f95129e5e54670f1'],
    [
      'one million a',
      new Uint8Array(1_000_000).fill(0x61),
      '34aa973cd4c4daa4f61eeb2bdbad27316534016f',
    ],
    // 1 MiB of `a`, digest from `shasum`.
    [
      '1 MiB of a',
      new Uint8Array(MIB).fill(0x61),
      '454027d64e3b855735552d42230eea1cbd645fa0',
    ],
  ])('%s', (_, bytes, digest) => {
    expect(sha1Hex(bytes)).toBe(digest)
  })
})

describe('H2 incremental', () => {
  const data = new Uint8Array(5000)
  for (let i = 0; i < data.length; i++) data[i] = (i * 31 + 7) & 0xff
  const oneShot = sha1Hex(data)

  it.each([
    ['1-byte chunks', [1]],
    ['uneven chunks', [3, 61, 64, 1, 127, 200, 55]],
    ['block-sized chunks', [64]],
    ['chunks around the padding edge', [55, 1, 8, 56]],
  ])('%s', (_, sizes) => {
    const sha1 = createSha1()
    let offset = 0
    for (let i = 0; offset < data.length; i++) {
      const size = sizes[i % sizes.length]
      sha1.update(data.subarray(offset, offset + size))
      offset += size
    }
    expect(sha1.digestHex()).toBe(oneShot)
  })

  it('empty updates change nothing', () => {
    const sha1 = createSha1()
    sha1.update(new Uint8Array(0))
    sha1.update(ascii('abc'))
    sha1.update(new Uint8Array(0))
    expect(sha1.digestHex()).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
  })

  it('every length from 0 to 130 matches one-shot (padding boundaries)', () => {
    for (let length = 0; length <= 130; length++) {
      const part = data.subarray(0, length)
      const sha1 = createSha1()
      sha1.update(part.subarray(0, length >> 1))
      sha1.update(part.subarray(length >> 1))
      expect(sha1.digestHex(), String(length)).toBe(sha1Hex(part))
    }
  })
})
