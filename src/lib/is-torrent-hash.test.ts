import { describe, expect, it } from 'vitest'
import { isTorrentHash } from './is-torrent-hash'

const SHA1 = 'a'.repeat(20) + '0123456789abcdef0123'
const SHA256 = '0123456789abcdef'.repeat(4)

describe('isTorrentHash', () => {
  it('accepts 40 lowercase hex characters', () => {
    expect(isTorrentHash(SHA1)).toBe(true)
  })

  it('accepts 64 lowercase hex characters', () => {
    expect(isTorrentHash(SHA256)).toBe(true)
  })

  it('rejects uppercase hex', () => {
    expect(isTorrentHash(SHA1.toUpperCase())).toBe(false)
    expect(isTorrentHash(SHA256.replace('a', 'A'))).toBe(false)
  })

  it('rejects the wrong length', () => {
    expect(isTorrentHash('')).toBe(false)
    expect(isTorrentHash(SHA1.slice(0, 39))).toBe(false)
    expect(isTorrentHash(`${SHA1}0`)).toBe(false)
    expect(isTorrentHash(SHA256.slice(0, 63))).toBe(false)
    expect(isTorrentHash(`${SHA256}0`)).toBe(false)
  })

  it('rejects non-hex characters', () => {
    expect(isTorrentHash(`${SHA1.slice(0, 39)}g`)).toBe(false)
    expect(isTorrentHash(`${SHA1.slice(0, 39)} `)).toBe(false)
    expect(isTorrentHash(`${SHA1}\n`)).toBe(false)
  })
})
