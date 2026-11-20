import { describe, expect, it } from 'vitest'
import {
  ENTRY_LABELS,
  addBatches,
  judgeEntries,
  splitPaste,
} from '#/lib/add-entries'
import type { AddEntry } from '#/lib/add-entries'
import { parseMagnet } from '#/lib/info-hash'
import type { ReadResult } from '#/lib/info-hash'
import { fakeHash } from '#/lib/testing'
import {
  MAX_ADD_ENTRIES,
  MAX_ADD_REQUEST_BYTES,
  MAX_TORRENT_FILE_BYTES,
  addFormAllowance,
} from '#/shared/torrent-add'

// Spec 4.5 P1, P2, J1, J2, B1 to B3.

interface Entry extends AddEntry {
  id: string
}

const entry = (id: string, result: ReadResult): Entry => ({ id, result })
const magnet = (id: string, hash: string, linkBytes = 60) =>
  entry(id, { kind: 'magnet', hash, name: null, linkBytes })
const file = (id: string, hash: string, fileBytes = 1000) =>
  entry(id, { kind: 'file', hash, name: id, contentBytes: 1, fileBytes })
const unreadable = (id: string, reason: 'link' | 'file' | 'too-large') =>
  entry(id, { kind: 'unreadable', reason })
const ids = (items: ReadonlyArray<{ entry: Entry }>) =>
  items.map((item) => item.entry.id)

describe('splitPaste', () => {
  it('P1 one entry per non-empty token, in order', () => {
    expect(
      splitPaste('  magnet:?a \n\n magnet:?b\tmagnet:?c\r\n　word  \n'),
    ).toEqual(['magnet:?a', 'magnet:?b', 'magnet:?c', 'word'])
  })

  it('P1 zero-width characters split like spaces', () => {
    expect(
      splitPaste('magnet:?a\u200bmagnet:?b\u200c\u200dword\u2060x\ufeffy'),
    ).toEqual(['magnet:?a', 'magnet:?b', 'word', 'x', 'y'])
  })

  it('P1 an unencoded space in a trailing dn stays in the magnet', () => {
    const hash = fakeHash(1)
    const text = [
      `magnet:?xt=urn:btih:${hash}&dn=Fake Show S01`,
      `magnet:?dn=Fake&xt=urn:btih:${hash} note`,
      `magnet:?xt=urn:btih:${hash}&dn=One magnet:?xt=urn:btih:${hash}`,
    ].join('\n')
    expect(splitPaste(text)).toEqual([
      `magnet:?xt=urn:btih:${hash}&dn=Fake Show S01`,
      `magnet:?dn=Fake&xt=urn:btih:${hash}`,
      'note',
      `magnet:?xt=urn:btih:${hash}&dn=One`,
      `magnet:?xt=urn:btih:${hash}`,
    ])
    expect(parseMagnet(splitPaste(text)[0])).toMatchObject({
      name: 'Fake Show S01',
    })
  })

  it('P1 a link after an open dn is its own entry', () => {
    expect(
      splitPaste(
        'magnet:?xt=urn:btih:x&dn=Fake https://example.invalid/x.torrent',
      ),
    ).toEqual([
      'magnet:?xt=urn:btih:x&dn=Fake',
      'https://example.invalid/x.torrent',
    ])
  })

  it('P1 a name word with a colon still joins; a parameter after it ends the name', () => {
    expect(
      splitPaste(
        'magnet:?xt=urn:btih:x&dn=Title Re:Zero Vol.2: end&tr=udp://t.invalid next',
      ),
    ).toEqual([
      'magnet:?xt=urn:btih:x&dn=Title Re:Zero Vol.2: end&tr=udp://t.invalid',
      'next',
    ])
    expect(splitPaste('magnet:?xt=urn:btih:x&dn=A b&dn=C d')).toEqual([
      'magnet:?xt=urn:btih:x&dn=A b&dn=C d',
    ])
  })

  it('P1 a long line after an open dn joins every word', () => {
    const words = Array.from({ length: 20_000 }, (_, i) => `w${i}`)
    const [entry, ...rest] = splitPaste(
      `magnet:?xt=urn:btih:x&dn=x ${words.join(' ')}`,
    )
    expect(rest).toEqual([])
    expect(entry.endsWith(' w19999')).toBe(true)
  })

  it('P1 the dn join never crosses a line', () => {
    expect(splitPaste('magnet:?xt=urn:btih:x&dn=Fake\nShow')).toEqual([
      'magnet:?xt=urn:btih:x&dn=Fake',
      'Show',
    ])
  })

  it('P1 blank text: no entries', () => {
    expect(splitPaste(' \n\t\n ')).toEqual([])
  })
})

describe('judgeEntries', () => {
  const none = new Set<string>()

  it('labels each kind from one table', () => {
    const judged = judgeEntries(
      [
        unreadable('link', 'link'),
        unreadable('file', 'file'),
        unreadable('big', 'too-large'),
        magnet('old', fakeHash(1)),
        magnet('new', fakeHash(2)),
      ],
      new Set([fakeHash(1)]),
    )
    expect(judged.map(({ status, label }) => [status, label])).toEqual([
      ['unreadable', '看不懂這個連結'],
      ['unreadable', '看不懂這個檔案'],
      ['unreadable', '檔案超過 10 MB'],
      ['existing', '以前下載過，已整理好'],
      ['addable', null],
    ])
    expect(ENTRY_LABELS.existing).toBe('以前下載過，已整理好')
  })

  it('J1 a hash in the maindata set is existing (archived included)', () => {
    const archived = fakeHash('b')
    const judged = judgeEntries([file('a', archived)], new Set([archived]))
    expect(judged[0].status).toBe('existing')
  })

  it('J2 unreadable first, then existing, then addable; input order inside', () => {
    const judged = judgeEntries(
      [
        magnet('add1', fakeHash(1)),
        magnet('old1', fakeHash(9)),
        unreadable('bad-link', 'link'),
        file('add2', fakeHash(2)),
        unreadable('too-big', 'too-large'),
        file('old2', fakeHash(8)),
        unreadable('bad-file', 'file'),
      ],
      new Set([fakeHash(8), fakeHash(9)]),
    )
    expect(ids(judged)).toEqual([
      'bad-link',
      'too-big',
      'bad-file',
      'old1',
      'old2',
      'add1',
      'add2',
    ])
  })

  it('P2 the same hash twice is one row, the first kept', () => {
    const judged = judgeEntries(
      [
        magnet('first', fakeHash(1)),
        file('again', fakeHash(1)),
        magnet('other', fakeHash(2)),
      ],
      none,
    )
    expect(ids(judged)).toEqual(['first', 'other'])
  })

  it('P2 hex and base32 of one hash in one paste merge', () => {
    const hex = '1112131415161718191a1b1c1d1e1f2021222324'
    const base32 = 'CEJBGFAVCYLRQGI2DMOB2HQ7EAQSEIZE'
    const entries = splitPaste(
      `magnet:?xt=urn:btih:${hex}\nmagnet:?xt=urn:btih:${base32}&dn=dup`,
    ).map((text) => entry(text, parseMagnet(text)))
    const judged = judgeEntries(entries, none)
    expect(judged).toHaveLength(1)
    expect(judged[0].entry.id).toBe(`magnet:?xt=urn:btih:${hex}`)
  })

  it('unreadable entries never merge (they have no hash)', () => {
    const judged = judgeEntries(
      [unreadable('a', 'link'), unreadable('b', 'link')],
      none,
    )
    expect(ids(judged)).toEqual(['a', 'b'])
  })
})

describe('addBatches', () => {
  const magnets = (count: number) =>
    Array.from({ length: count }, (_, i) => magnet(`m${i}`, fakeHash(i + 1)))

  it('B1 20 addable: one batch', () => {
    expect(addBatches(magnets(MAX_ADD_ENTRIES)).map((b) => b.length)).toEqual([
      20,
    ])
  })

  it('B1 21 addable: 20 + 1, input order kept', () => {
    const batches = addBatches(magnets(21))
    expect(batches.map((b) => b.length)).toEqual([20, 1])
    expect(batches.flat().map((e) => e.id)).toEqual(
      magnets(21).map((e) => e.id),
    )
  })

  it('B3 only magnets: batches of 20', () => {
    expect(addBatches(magnets(45)).map((b) => b.length)).toEqual([20, 20, 5])
  })

  it('no entries: no batches', () => {
    expect(addBatches([])).toEqual([])
  })

  /** Five files whose bytes plus the allowance land `over` past the limit. */
  function fiveFiles(over: number) {
    const total = MAX_ADD_REQUEST_BYTES - addFormAllowance(5) + over
    const each = Math.floor(total / 5)
    const sizes = [each, each, each, each, total - 4 * each]
    return sizes.map((size, i) => file(`f${i}`, fakeHash(i + 1), size))
  }

  it('B2 files just under the budget: one batch', () => {
    const files = fiveFiles(0)
    const bytes = files.reduce(
      (sum, f) => sum + (f.result.kind === 'file' ? f.result.fileBytes : 0),
      0,
    )
    expect(bytes + addFormAllowance(5)).toBe(MAX_ADD_REQUEST_BYTES)
    expect(addBatches(files).map((b) => b.length)).toEqual([5])
  })

  it('B2 one byte over: split before the file that crosses it', () => {
    const batches = addBatches(fiveFiles(1))
    expect(batches.map((b) => b.map((e) => e.id))).toEqual([
      ['f0', 'f1', 'f2', 'f3'],
      ['f4'],
    ])
  })

  it('B2 a magnet adds no file bytes, only its form allowance', () => {
    // Room for one more entry's allowance: the magnet joins the batch.
    expect(
      addBatches([...fiveFiles(-100_000), ...magnets(1)]).map((b) => b.length),
    ).toEqual([6])
    // Less room than one allowance: the magnet starts the next batch.
    expect(
      addBatches([...fiveFiles(-1000), ...magnets(1)]).map((b) => b.length),
    ).toEqual([5, 1])
  })

  it('B3 a magnet link counts its bytes and can split the batch', () => {
    // Four files leave 1000 bytes of room for a fifth entry.
    const room = MAX_ADD_REQUEST_BYTES - addFormAllowance(5) - 1000
    const quarter = Math.floor(room / 4)
    const files = [0, 1, 2, 3].map((i) =>
      file(`f${i}`, fakeHash(i + 1), i < 3 ? quarter : room - 3 * quarter),
    )
    const sizes = (linkBytes: number) =>
      addBatches([...files, magnet('m', fakeHash(9), linkBytes)]).map(
        (b) => b.length,
      )
    expect(sizes(1000)).toEqual([5])
    expect(sizes(1001)).toEqual([4, 1])
  })

  it('every batch fits the request limit with its allowance', () => {
    const files = Array.from({ length: 30 }, (_, i) =>
      file(`f${i}`, fakeHash(i + 1), MAX_TORRENT_FILE_BYTES - i),
    )
    const batches = addBatches(files)
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(MAX_ADD_ENTRIES)
      const bytes = batch.reduce(
        (sum, f) => sum + (f.result.kind === 'file' ? f.result.fileBytes : 0),
        0,
      )
      expect(bytes + addFormAllowance(batch.length)).toBeLessThanOrEqual(
        MAX_ADD_REQUEST_BYTES,
      )
    }
    // Four ~10 MB files fit 50 MB with their allowance, five do not.
    expect(batches.map((b) => b.length)).toEqual([4, 4, 4, 4, 4, 4, 4, 2])
  })
})
