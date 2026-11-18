import { describe, expect, it } from 'vitest'
import {
  MAX_VIEWED_HASHES,
  PREF_DEFAULTS,
  PREF_KEYS,
  isPrefKey,
  readPref,
  withViewedHash,
  writePref,
} from '#/lib/prefs'
import { fakeHash } from '#/lib/testing'
import { ALL } from '#/shared/categories'

// Spec 2.8 row C2: the key table, the default, and storage that fails.

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  }
}

const throwing: Storage = {
  length: 0,
  clear: () => {
    throw new Error('blocked')
  },
  getItem: () => {
    throw new Error('blocked')
  },
  key: () => null,
  removeItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('quota')
  },
}

describe('autoCollapse', () => {
  it('defaults to on', () => {
    expect(PREF_DEFAULTS.autoCollapse).toBe(true)
    expect(readPref('autoCollapse', memoryStorage())).toBe(true)
  })

  it('writes and reads back', () => {
    const storage = memoryStorage()
    expect(writePref('autoCollapse', false, storage)).toBe(true)
    expect(storage.getItem(PREF_KEYS.autoCollapse)).toBe('off')
    expect(readPref('autoCollapse', storage)).toBe(false)
    writePref('autoCollapse', true, storage)
    expect(readPref('autoCollapse', storage)).toBe(true)
  })

  it('C2 a broken stored value reads the default', () => {
    for (const raw of ['', 'false', '0', '{"x":1}', 'OFF']) {
      const storage = memoryStorage({ [PREF_KEYS.autoCollapse]: raw })
      expect(readPref('autoCollapse', storage)).toBe(true)
    }
  })

  it('C2 storage that throws or is missing reads the default', () => {
    expect(readPref('autoCollapse', throwing)).toBe(true)
    expect(writePref('autoCollapse', false, throwing)).toBe(false)
    expect(readPref('autoCollapse', null)).toBe(true)
    expect(writePref('autoCollapse', false, null)).toBe(false)
  })

  it('without a page storage (node) reads the default', () => {
    expect(readPref('autoCollapse')).toBe(true)
  })

  it('storage events: its own key and clear() concern it', () => {
    expect(isPrefKey(PREF_KEYS.autoCollapse, 'autoCollapse')).toBe(true)
    expect(isPrefKey(null, 'autoCollapse')).toBe(true)
    expect(isPrefKey('other', 'autoCollapse')).toBe(false)
  })
})

describe('lastCategory (story 3.6)', () => {
  it('defaults to 「全部」', () => {
    expect(PREF_DEFAULTS.lastCategory).toBe(ALL)
    expect(readPref('lastCategory', memoryStorage())).toBe(ALL)
  })

  it('writes and reads back a name, uncategorized and 「全部」', () => {
    const storage = memoryStorage()
    for (const category of ['mteam-tv', '', ALL, '2024', '<script>']) {
      expect(writePref('lastCategory', category, storage)).toBe(true)
      expect(readPref('lastCategory', storage)).toBe(category)
    }
  })

  it('a bad stored value reads as 「全部」', () => {
    for (const raw of [
      'mteam-tv', // not JSON
      '{',
      '42',
      'null',
      '["X"]',
      '"__proto__"',
      JSON.stringify('a'.repeat(256)),
      JSON.stringify('bad\u0000name'),
    ]) {
      const storage = memoryStorage({ [PREF_KEYS.lastCategory]: raw })
      expect(readPref('lastCategory', storage)).toBe(ALL)
    }
  })

  it('storage that throws or is missing reads 「全部」; writes never throw', () => {
    expect(readPref('lastCategory', throwing)).toBe(ALL)
    expect(writePref('lastCategory', 'X', throwing)).toBe(false)
    expect(readPref('lastCategory', null)).toBe(ALL)
    expect(writePref('lastCategory', 'X', null)).toBe(false)
  })
})

describe('lastViewedHash (story 3.6)', () => {
  const A = fakeHash(1)
  const B = fakeHash(2)

  it('defaults to empty', () => {
    expect(PREF_DEFAULTS.lastViewedHash.size).toBe(0)
    expect(readPref('lastViewedHash', memoryStorage()).size).toBe(0)
  })

  it('writes and reads back per category', () => {
    const storage = memoryStorage()
    let hashes = readPref('lastViewedHash', storage)
    hashes = withViewedHash(hashes, 'mteam-tv', A)
    hashes = withViewedHash(hashes, ALL, B)
    hashes = withViewedHash(hashes, '', A)
    expect(writePref('lastViewedHash', hashes, storage)).toBe(true)
    const read = readPref('lastViewedHash', storage)
    expect(read.get('mteam-tv')).toBe(A)
    expect(read.get(ALL)).toBe(B)
    expect(read.get('')).toBe(A)
    expect(read.get('X')).toBeUndefined()
  })

  it('a new hash replaces the old one and becomes the newest entry', () => {
    let hashes = withViewedHash(new Map(), 'X', A)
    hashes = withViewedHash(hashes, 'mteam-X', A)
    hashes = withViewedHash(hashes, 'X', B)
    expect([...hashes]).toEqual([
      ['mteam-X', A],
      ['X', B],
    ])
  })

  it('withViewedHash never changes its input and refuses bad keys or hashes', () => {
    const before = withViewedHash(new Map(), 'X', A)
    const after = withViewedHash(before, 'X', B)
    expect(before.get('X')).toBe(A)
    expect(after.get('X')).toBe(B)
    expect(withViewedHash(before, 'X', 'NOT-A-HASH')).toBe(before)
    expect(withViewedHash(before, '__proto__', B)).toBe(before)
  })

  it(`keeps at most ${MAX_VIEWED_HASHES} categories, dropping the oldest`, () => {
    let hashes = withViewedHash(new Map(), 'oldest', A)
    for (let index = 1; index <= MAX_VIEWED_HASHES; index += 1) {
      hashes = withViewedHash(hashes, `c${index}`, B)
    }
    expect(hashes.size).toBe(MAX_VIEWED_HASHES)
    expect(hashes.has('oldest')).toBe(false)
    expect(hashes.get(`c${MAX_VIEWED_HASHES}`)).toBe(B)
    const storage = memoryStorage()
    writePref('lastViewedHash', hashes, storage)
    expect(readPref('lastViewedHash', storage).size).toBe(MAX_VIEWED_HASHES)
  })

  it('a stored value over the cap reads its newest entries', () => {
    const entries = Array.from(
      { length: MAX_VIEWED_HASHES + 5 },
      (_, index) => [`c${index}`, A],
    )
    const storage = memoryStorage({
      [PREF_KEYS.lastViewedHash]: JSON.stringify(entries),
    })
    const read = readPref('lastViewedHash', storage)
    expect(read.size).toBe(MAX_VIEWED_HASHES)
    expect(read.has('c0')).toBe(false)
    expect(read.has(`c${MAX_VIEWED_HASHES + 4}`)).toBe(true)
  })

  it('a bad entry is absent; the good ones stay', () => {
    const storage = memoryStorage({
      [PREF_KEYS.lastViewedHash]: JSON.stringify([
        ['X', 'not-a-hash'],
        ['X', fakeHash('b').toUpperCase()],
        ['__proto__', A],
        [42, A],
        ['only-one'],
        'text',
        null,
        ['mteam-X', B],
      ]),
    })
    const read = readPref('lastViewedHash', storage)
    expect([...read]).toEqual([['mteam-X', B]])
  })

  it('a stored value that is not a list of pairs reads empty', () => {
    for (const raw of ['', '{', '{"X":"a"}', '"x"', 'null', '7']) {
      const storage = memoryStorage({ [PREF_KEYS.lastViewedHash]: raw })
      expect(readPref('lastViewedHash', storage).size).toBe(0)
    }
  })

  it('storage that throws or is missing reads empty; writes never throw', () => {
    const hashes = withViewedHash(new Map(), 'X', A)
    expect(readPref('lastViewedHash', throwing).size).toBe(0)
    expect(writePref('lastViewedHash', hashes, throwing)).toBe(false)
    expect(readPref('lastViewedHash', null).size).toBe(0)
    expect(writePref('lastViewedHash', hashes, null)).toBe(false)
  })
})

describe('two devices (story 3.6)', () => {
  it('each storage keeps its own values', () => {
    const desk = memoryStorage()
    const phone = memoryStorage()
    writePref('lastCategory', 'mteam-tv', desk)
    writePref(
      'lastViewedHash',
      withViewedHash(new Map(), 'mteam-tv', fakeHash(1)),
      desk,
    )
    writePref('lastCategory', 'X', phone)
    writePref(
      'lastViewedHash',
      withViewedHash(new Map(), 'X', fakeHash(2)),
      phone,
    )
    expect(readPref('lastCategory', desk)).toBe('mteam-tv')
    expect(readPref('lastCategory', phone)).toBe('X')
    expect(readPref('lastViewedHash', desk).get('mteam-tv')).toBe(fakeHash(1))
    expect(readPref('lastViewedHash', desk).has('X')).toBe(false)
    expect(readPref('lastViewedHash', phone).get('X')).toBe(fakeHash(2))
    expect(readPref('lastViewedHash', phone).has('mteam-tv')).toBe(false)
  })
})

describe('the key table', () => {
  it('keys are unique and prefixed', () => {
    const keys = Object.values(PREF_KEYS)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key.startsWith('rt.')).toBe(true)
  })
})
