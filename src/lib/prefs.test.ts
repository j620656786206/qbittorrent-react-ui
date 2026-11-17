import { describe, expect, it } from 'vitest'
import {
  PREF_DEFAULTS,
  PREF_KEYS,
  isPrefKey,
  readPref,
  writePref,
} from '#/lib/prefs'

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

describe('the key table', () => {
  it('keys are unique and prefixed', () => {
    const keys = Object.values(PREF_KEYS)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key.startsWith('rt.')).toBe(true)
  })
})
