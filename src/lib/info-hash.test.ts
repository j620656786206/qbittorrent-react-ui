import { describe, expect, it, vi } from 'vitest'
import {
  HASH_CHUNK_BYTES,
  btihToHex,
  parseMagnet,
  readTorrentFile,
  readTorrentFiles,
} from '#/lib/info-hash'
import type { TorrentFileSource } from '#/lib/info-hash'
import { sha1Hex } from '#/lib/sha1'
import {
  bencode,
  concat,
  fakePieces,
  piecesFor,
  singleFileInfo,
  torrentBytes,
  torrentOfSize,
} from '#/lib/bencode-testing'
import type { Bencodable } from '#/lib/bencode-testing'
import { MAX_TORRENT_FILE_BYTES } from '#/shared/torrent-add'

// Spec 4.5 T1 to T9 and M1 to M4, plus the hashing measurement (AC 1).
// Torrents are generated here with the test encoder; no real files.

const yieldToMain = () => Promise.resolve()
const options = { yieldToMain }

function source(bytes: Uint8Array): TorrentFileSource {
  return {
    size: bytes.length,
    arrayBuffer: async () =>
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
  }
}

const read = (bytes: Uint8Array) => readTorrentFile(source(bytes), options)
const UNREADABLE_FILE = { kind: 'unreadable', reason: 'file' }

/** `info` without one of its keys. */
function without(
  info: { [key: string]: Bencodable },
  key: string,
): { [key: string]: Bencodable } {
  return Object.fromEntries(Object.entries(info).filter(([k]) => k !== key))
}

/** A valid multi-file info around `files`, one piece of 16 KiB. */
function multiFileInfo(files: ReadonlyArray<Bencodable>) {
  return {
    files,
    name: 'Fake.Show.S01',
    'piece length': 16_384,
    pieces: fakePieces(1),
  }
}
const ONE_FILE = [{ length: 100, path: ['a.mkv'] }]
const BIG = 2 ** 53 + 2

describe('readTorrentFile', () => {
  it('T1 v1 single-file: hash of the raw info bytes, name and sizes', async () => {
    const info = singleFileInfo()
    const file = torrentBytes(info)
    expect(await read(file)).toEqual({
      kind: 'file',
      hash: sha1Hex(bencode(info)),
      name: 'Fake.Show.S01E01.1080p.mkv',
      contentBytes: 1_234_567,
      fileBytes: file.length,
    })
  })

  it('T1 a Blob works as the source', async () => {
    const info = singleFileInfo()
    const result = await readTorrentFile(
      new Blob([torrentBytes(info) as Uint8Array<ArrayBuffer>]),
      options,
    )
    expect(result).toMatchObject({ kind: 'file', hash: sha1Hex(bencode(info)) })
  })

  it('T2 v1 multi-file: content is the sum of file lengths', async () => {
    const info = {
      files: [
        { length: 100, path: ['a.mkv'] },
        { length: 250, path: ['sub', 'b.srt'] },
      ],
      name: 'Fake.Show.S01',
      'piece length': 16_384,
      pieces: fakePieces(1),
    }
    expect(await read(torrentBytes(info))).toMatchObject({
      kind: 'file',
      hash: sha1Hex(bencode(info)),
      name: 'Fake.Show.S01',
      contentBytes: 350,
    })
  })

  it('T2 padding files do not count as content', async () => {
    const info: Bencodable = {
      files: [
        { length: 100, path: ['a.mkv'] },
        { attr: 'p', length: 16_284, path: ['.pad', '16284'] },
        { length: 50, path: ['b.mkv'] },
      ],
      name: 'Fake.Show.S01',
      'piece length': 16_384,
      pieces: fakePieces(2),
    }
    expect(await read(torrentBytes(info))).toMatchObject({ contentBytes: 150 })
  })

  it('T3 hybrid: readable with the v1 hash', async () => {
    const info = singleFileInfo({
      'file tree': {
        'Fake.Show.S01E01.1080p.mkv': {
          '': { length: 1_234_567, 'pieces root': new Uint8Array(32) },
        },
      },
      'meta version': 2,
    })
    expect(
      await read(torrentBytes(info, { 'piece layers': {} })),
    ).toMatchObject({ kind: 'file', hash: sha1Hex(bencode(info)) })
  })

  it('T4 v2-only: unreadable file', async () => {
    const info = {
      'file tree': {
        'a.mkv': { '': { length: 10, 'pieces root': new Uint8Array(32) } },
      },
      'meta version': 2,
      name: 'Fake.Show.S01',
      'piece length': 16_384,
    }
    expect(await read(torrentBytes(info))).toEqual(UNREADABLE_FILE)
  })

  it.each([
    ['not a dictionary', bencode(['info'])],
    ['an integer', bencode(42)],
    ['garbage', new TextEncoder().encode('hello, this is not a torrent')],
    ['empty', new Uint8Array(0)],
    ['truncated', torrentBytes(singleFileInfo()).subarray(0, 60)],
    [
      'trailing junk after the dictionary',
      concat([torrentBytes(singleFileInfo()), new Uint8Array([0x78])]),
    ],
    [
      'junk inside the dictionary',
      new TextEncoder().encode('d4:infod4:name1:x!!e6:lengthi1eee'),
    ],
    ['no info', bencode({ announce: 'http://tracker.invalid/announce' })],
    ['info not a dictionary', torrentBytes('info')],
    ['no length or files', torrentBytes(without(singleFileInfo(), 'length'))],
    [
      'pieces not a multiple of 20',
      torrentBytes(singleFileInfo({ pieces: new Uint8Array(21) })),
    ],
    [
      'negative length',
      torrentBytes(singleFileInfo({ length: -1, pieces: fakePieces(1) })),
    ],
    [
      'length above 2^53',
      torrentBytes(singleFileInfo({ length: BIG, pieces: fakePieces(1) })),
    ],
    ['no name', torrentBytes(without(singleFileInfo(), 'name'))],
    ['empty name', torrentBytes(singleFileInfo({ name: '' }))],
    [
      'empty name and empty name.utf-8',
      torrentBytes(singleFileInfo({ name: '', 'name.utf-8': '' })),
    ],
    [
      'no piece length',
      torrentBytes(without(singleFileInfo(), 'piece length')),
    ],
    [
      'piece length 0',
      torrentBytes(
        singleFileInfo({ 'piece length': 0, pieces: fakePieces(5) }),
      ),
    ],
    [
      'negative piece length',
      torrentBytes(
        singleFileInfo({ 'piece length': -1, pieces: fakePieces(5) }),
      ),
    ],
    [
      'one piece hash too few',
      torrentBytes(singleFileInfo({ pieces: fakePieces(4) })),
    ],
    [
      'one piece hash too many',
      torrentBytes(singleFileInfo({ pieces: fakePieces(6) })),
    ],
    [
      'both length and files',
      torrentBytes({ ...multiFileInfo(ONE_FILE), length: 100 }),
    ],
    [
      'an invalid length next to valid files',
      torrentBytes({ ...multiFileInfo(ONE_FILE), length: -1 }),
    ],
    ['an empty files list', torrentBytes(multiFileInfo([]))],
    ['a file without path', torrentBytes(multiFileInfo([{ length: 100 }]))],
    [
      'a file with an empty path',
      torrentBytes(multiFileInfo([{ length: 100, path: [] }])),
    ],
    [
      'a file whose path is a string',
      torrentBytes(multiFileInfo([{ length: 100, path: 'a.mkv' }])),
    ],
    [
      'a file whose path holds an integer',
      torrentBytes(multiFileInfo([{ length: 100, path: ['sub', 7] }])),
    ],
    [
      'a multi-file total above 2^53',
      torrentBytes(
        multiFileInfo(
          [1, 2, 3].map((n) => ({ length: 2 ** 52, path: [`${n}.mkv`] })),
        ),
      ),
    ],
    ['a file without length', torrentBytes(multiFileInfo([{ path: ['a'] }]))],
  ])('T5 %s: unreadable file', async (_, bytes) => {
    expect(await read(bytes)).toEqual(UNREADABLE_FILE)
  })

  it('the T5 fixtures start from a readable multi-file info', async () => {
    expect(await read(torrentBytes(multiFileInfo(ONE_FILE)))).toMatchObject({
      kind: 'file',
      contentBytes: 100,
    })
  })

  it('unreadable results are frozen', async () => {
    const result = await read(new Uint8Array(0))
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(parseMagnet('hello'))).toBe(true)
  })

  it('T5 a failing read is an unreadable file', async () => {
    const result = await readTorrentFile(
      { size: 10, arrayBuffer: () => Promise.reject(new Error('gone')) },
      options,
    )
    expect(result).toEqual(UNREADABLE_FILE)
  })

  it('T5 never throws on random bytes or random cuts of a torrent', async () => {
    let seed = 12345
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff
      return seed
    }
    const alphabet = new TextEncoder().encode('dlie0123456789:-x')
    const valid = torrentBytes(singleFileInfo())
    for (let round = 0; round < 2000; round++) {
      const length = random() % 80
      const bytes = new Uint8Array(length)
      for (let i = 0; i < length; i++) {
        bytes[i] =
          round % 2 === 0
            ? alphabet[random() % alphabet.length]
            : random() & 0xff
      }
      await expect(read(bytes)).resolves.toBeDefined()
      const cut = valid.slice(0, random() % valid.length)
      cut[random() % Math.max(1, cut.length)] = random() & 0xff
      await expect(read(cut)).resolves.toBeDefined()
    }
  })

  it('T6 over 10 MB: too large, the bytes are never read', async () => {
    const arrayBuffer = vi.fn(() => Promise.resolve(new ArrayBuffer(0)))
    const result = await readTorrentFile(
      { size: MAX_TORRENT_FILE_BYTES + 1, arrayBuffer },
      options,
    )
    expect(result).toEqual({ kind: 'unreadable', reason: 'too-large' })
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('T7 exactly 10 MB: readable', async () => {
    const file = torrentOfSize(MAX_TORRENT_FILE_BYTES)
    expect(file.length).toBe(MAX_TORRENT_FILE_BYTES)
    expect(await read(file)).toMatchObject({
      kind: 'file',
      fileBytes: MAX_TORRENT_FILE_BYTES,
    })
  })

  it('T8 unsorted info keys: hash of the raw bytes as given', async () => {
    const info = {
      pieces: fakePieces(1),
      name: 'Fake.Show.S01E01',
      length: 10,
      'piece length': 16_384,
    }
    const sorted = {
      length: 10,
      name: 'Fake.Show.S01E01',
      'piece length': 16_384,
      pieces: fakePieces(1),
    }
    const result = await read(torrentBytes(info))
    expect(result).toMatchObject({ hash: sha1Hex(bencode(info)) })
    expect(result).not.toMatchObject({ hash: sha1Hex(bencode(sorted)) })
  })

  it('T9 bad UTF-8 name: replacement characters, still readable', async () => {
    const name = new Uint8Array([0x41, 0xff, 0xfe, 0x42])
    expect(await read(torrentBytes(singleFileInfo({ name })))).toMatchObject({
      kind: 'file',
      name: 'A��B',
    })
  })

  it('prefers name.utf-8 and decodes UTF-8 names', async () => {
    const info = singleFileInfo({ name: 'x', 'name.utf-8': '中文.Show' })
    expect(await read(torrentBytes(info))).toMatchObject({ name: '中文.Show' })
    expect(
      await read(torrentBytes(singleFileInfo({ name: '測試' }))),
    ).toMatchObject({ name: '測試' })
  })

  it('an empty name.utf-8 falls back to name', async () => {
    const info = singleFileInfo({ name: 'Fake.Show', 'name.utf-8': '' })
    expect(await read(torrentBytes(info))).toMatchObject({
      kind: 'file',
      name: 'Fake.Show',
    })
  })

  it('yields after the parse and before each chunk of at most 1 MiB', async () => {
    const file = torrentOfSize(3 * HASH_CHUNK_BYTES + 500)
    const yields = vi.fn(yieldToMain)
    const result = await readTorrentFile(source(file), { yieldToMain: yields })
    expect(result.kind).toBe('file')
    // The info value is the file minus a few hundred bytes: 4 chunks, plus
    // the yield between checking the file and reading its fields.
    expect(yields).toHaveBeenCalledTimes(1 + 4)
  })
})

describe('readTorrentFiles', () => {
  it('reads in order and yields between files', async () => {
    const a = singleFileInfo({ name: 'A' })
    const b = singleFileInfo({ name: 'B' })
    const yields = vi.fn(yieldToMain)
    const results = await readTorrentFiles(
      [
        source(torrentBytes(a)),
        source(new Uint8Array(3)),
        source(torrentBytes(b)),
      ],
      { yieldToMain: yields },
    )
    expect(results).toEqual([
      expect.objectContaining({ hash: sha1Hex(bencode(a)), name: 'A' }),
      UNREADABLE_FILE,
      expect.objectContaining({ hash: sha1Hex(bencode(b)), name: 'B' }),
    ])
    // Per readable file one after the parse and one chunk; the garbage
    // fails the parse before any yield; one between each pair of files.
    expect(yields).toHaveBeenCalledTimes(2 * 2 + 2)
  })
})

const HEX = '1112131415161718191a1b1c1d1e1f2021222324'
// The same 20 bytes in RFC 4648 base32 (from Python's base64.b32encode).
const BASE32 = 'CEJBGFAVCYLRQGI2DMOB2HQ7EAQSEIZE'

describe('parseMagnet', () => {
  it('M1 40-hex btih in any case, with a decoded dn', () => {
    expect(
      parseMagnet(
        `magnet:?xt=urn:btih:${HEX.toUpperCase()}&dn=Fake.Show%20S01+E01&tr=http%3A%2F%2Ftracker.invalid`,
      ),
    ).toMatchObject({ kind: 'magnet', hash: HEX, name: 'Fake.Show S01 E01' })
  })

  it('M1 no dn: name is null', () => {
    const link = `magnet:?xt=urn:btih:${HEX}`
    expect(parseMagnet(link)).toEqual({
      kind: 'magnet',
      hash: HEX,
      name: null,
      linkBytes: link.length,
    })
  })

  it('linkBytes is the UTF-8 length of the trimmed link', () => {
    const link = `magnet:?xt=urn:btih:${HEX}&dn=中文`
    expect(parseMagnet(`  ${link}\n`)).toMatchObject({
      linkBytes: new TextEncoder().encode(link).length,
    })
  })

  it('a btih that does not convert is skipped for a later one', () => {
    expect(
      parseMagnet(`magnet:?xt=urn:btih:${'g'.repeat(40)}&xt=urn:btih:${HEX}`),
    ).toMatchObject({ kind: 'magnet', hash: HEX })
  })

  it('numbered xt.1, xt.2 parameters are read too', () => {
    expect(
      parseMagnet(
        `magnet:?xt.1=urn:btmh:1220${'ab'.repeat(32)}&xt.2=urn:btih:${BASE32}`,
      ),
    ).toMatchObject({ kind: 'magnet', hash: HEX })
  })

  it('M1 a hybrid magnet: btih wins over btmh', () => {
    expect(
      parseMagnet(
        `MAGNET:?xt=urn:btmh:1220${'ab'.repeat(32)}&xt=URN:BTIH:${HEX}`,
      ),
    ).toMatchObject({ kind: 'magnet', hash: HEX })
  })

  it('M2 32-char base32 btih in any case: lowercase hex', () => {
    expect(parseMagnet(`magnet:?xt=urn:btih:${BASE32}`)).toMatchObject({
      hash: HEX,
    })
    expect(
      parseMagnet(`magnet:?xt=urn:btih:${BASE32.toLowerCase()}`),
    ).toMatchObject({ hash: HEX })
  })

  it.each([
    ['btmh only', `magnet:?xt=urn:btmh:1220${'ab'.repeat(32)}&dn=x`],
    ['no xt', 'magnet:?dn=Fake.Show'],
    ['39 hex', `magnet:?xt=urn:btih:${HEX.slice(1)}`],
    ['non-hex 40 chars', `magnet:?xt=urn:btih:${'g'.repeat(40)}`],
    ['31 base32', `magnet:?xt=urn:btih:${BASE32.slice(1)}`],
    ['bad base32 char', `magnet:?xt=urn:btih:${BASE32.slice(1)}1`],
    [
      'only bad btihs',
      `magnet:?xt=urn:btih:abc&xt.1=urn:btih:${'z'.repeat(39)}`,
    ],
    ['empty btih', 'magnet:?xt=urn:btih:'],
    ['M4 https link', 'https://example.invalid/file.torrent'],
    ['M4 plain words', 'hello'],
    ['M4 magnet without ?', `magnet:xt=urn:btih:${HEX}`],
  ])('M3 %s: unreadable link', (_, text) => {
    expect(parseMagnet(text)).toEqual({ kind: 'unreadable', reason: 'link' })
  })
})

describe('btihToHex', () => {
  it('all-A base32 is all zero', () => {
    expect(btihToHex('A'.repeat(32))).toBe('0'.repeat(40))
  })
  it('all-7 base32 is all f', () => {
    expect(btihToHex('7'.repeat(32))).toBe('f'.repeat(40))
  })
})

describe('measurement: 20 generated 10 MB torrents (AC 1)', () => {
  /** About 9.4 MB of file entries: the parse, not the hashing, is the cost. */
  function manyFilesTorrent(): Uint8Array {
    const files = Array.from({ length: 150_000 }, (_, i) => ({
      length: 1000 + i,
      path: ['Season 01', `Fake.Show.S01E${i}.mkv`],
    }))
    const total = files.reduce((sum, file) => sum + file.length, 0)
    return torrentBytes({
      files,
      name: 'Fake.Show.S01',
      'piece length': 4_194_304,
      pieces: piecesFor(total, 4_194_304),
    })
  }

  it('no slice between two yields reaches 200 ms', async () => {
    // Half are one big `pieces` string at exactly 10 MB (the most bytes to
    // hash), half are 150,000 file entries (the most to parse).
    const shapes = [torrentOfSize(MAX_TORRENT_FILE_BYTES), manyFilesTorrent()]
    const nameAt = shapes.map((bytes) => bytes.indexOf(0x53, 200)) // `S01`
    const files = Array.from({ length: 20 }, (_, index) => {
      const base = shapes[index % 2]
      return {
        size: base.length,
        // Files are read one after another, so each read changes one name
        // byte of the shared bytes in place and every hash differs.
        arrayBuffer: async () => {
          base[nameAt[index % 2]] = 0x61 + index
          return base.buffer as ArrayBuffer
        },
      }
    })
    // Each slice is timed twice: wall clock, and this thread's CPU time.
    // The full suite runs many test files at once (worker threads of one
    // process), so a slice's wall clock also counts the time other workers
    // held the CPU; the thread's CPU time is the work the slice itself did,
    // which is what blocks a browser main thread.
    const wallSlices: Array<number> = []
    const cpuSlices: Array<number> = []
    const cpuMs = () => {
      const { user, system } = process.threadCpuUsage()
      return (user + system) / 1000
    }
    let resumedWall = performance.now()
    let resumedCpu = cpuMs()
    const endSlice = () => {
      wallSlices.push(performance.now() - resumedWall)
      cpuSlices.push(cpuMs() - resumedCpu)
    }
    const measuredYield = async () => {
      endSlice()
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      resumedWall = performance.now()
      resumedCpu = cpuMs()
    }
    const start = performance.now()
    const results = await readTorrentFiles(files, {
      yieldToMain: measuredYield,
    })
    endSlice()
    const total = performance.now() - start

    const hashes = results.map((result) =>
      result.kind === 'file' ? result.hash : null,
    )
    expect(hashes.every((hash) => hash !== null)).toBe(true)
    expect(new Set(hashes).size).toBe(20)
    const round = (ms: number) => Number(ms.toFixed(1))
    const longestCpu = Math.max(...cpuSlices)
    console.info('4.5 hashing ms', {
      longestWall: round(Math.max(...wallSlices)),
      longestCpu: round(longestCpu),
      total: round(total),
      slices: wallSlices.length,
    })
    // Dev machine numbers are in the spec's Design Notes and the PR. The
    // bound is the AC's 200 ms; the dev machine's longest slice is about a
    // quarter of it, which leaves room for slower CI machines.
    expect(longestCpu).toBeLessThan(200)
  }, 60_000)
})
