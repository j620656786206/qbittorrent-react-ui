import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  chmod,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLogger } from '#/server/log'
import { migrateSettings } from '#/server/settings/migrations'
import { isUnderSaveRoot } from '#/server/settings/save-roots'
import {
  MAX_SETTINGS_BYTES,
  SETTINGS_FILE,
  createSettingsStore,
} from '#/server/settings/store'
import type { SettingsStore } from '#/server/settings/store'
import { ALL } from '#/shared/categories'
import { defaultSettings } from '#/shared/settings'
import type { Settings } from '#/shared/settings'

// Story 3.1 matrix rows 1 to 7 and the SAVE_ROOTS half of the path schema:
// the settings store in a temporary folder (never ./config). Code-name
// categories and fake /data paths only.

const NOW = new Date('2026-11-18T09:30:12.345Z')
const ROOTS = ['/data']

let dir: string
let lines: Array<string>
let store: SettingsStore

const file = () => join(dir, SETTINGS_FILE)
const logText = () => lines.join('')
const events = (event: string) =>
  lines
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((line) => line.event === event)

function makeStore(): SettingsStore {
  return createSettingsStore({
    dir,
    saveRoots: ROOTS,
    logger: createLogger({
      write: (line) => lines.push(line),
      secrets: () => [],
    }),
    now: () => NOW,
  })
}

async function writeRaw(content: unknown) {
  await writeFile(
    file(),
    typeof content === 'string' ? content : JSON.stringify(content),
  )
}

async function readJson(): Promise<unknown> {
  return JSON.parse(await readFile(file(), 'utf8'))
}

async function modeOf(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777
}

const setSort =
  (category: string, sort: 'ratio' | 'name', direction: 'asc' | 'desc') =>
  (current: Settings): Settings => ({
    ...current,
    categorySort: Object.fromEntries([
      ...Object.entries(current.categorySort),
      [category, { sort, dir: direction }],
    ]),
  })

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rt-settings-test-'))
  lines = []
  store = makeStore()
})

afterEach(async () => {
  await chmod(dir, 0o700).catch(() => undefined)
  await rm(dir, { recursive: true, force: true })
})

describe('first start (row 1)', () => {
  it('no settings.json: defaults are written with mode 600', async () => {
    expect(await store.read()).toEqual(defaultSettings())
    expect(await readJson()).toEqual(defaultSettings())
    expect(await modeOf(file())).toBe(0o600)
  })

  it('a CONFIG_DIR that does not exist yet is created', async () => {
    const nested = join(dir, 'config')
    const nestedStore = createSettingsStore({
      dir: nested,
      saveRoots: ROOTS,
      logger: createLogger({ write: () => undefined }),
    })
    expect(await nestedStore.read()).toEqual(defaultSettings())
    expect(await modeOf(join(nested, SETTINGS_FILE))).toBe(0o600)
  })

  it('a second read does not write again', async () => {
    await store.read()
    const before = (await stat(file())).mtimeMs
    await new Promise((resolve) => setTimeout(resolve, 20))
    await store.read()
    expect((await stat(file())).mtimeMs).toBe(before)
  })
})

describe('missing section (row 2)', () => {
  it('a file without commonPaths gets [] and keeps the others', async () => {
    await writeRaw({
      version: 1,
      categorySort: { [ALL]: { sort: 'seeding_time', dir: 'desc' } },
      categoryOrder: ['mteam-X', 'X'],
    })
    const expected = {
      version: 1,
      categorySort: { [ALL]: { sort: 'seeding_time', dir: 'desc' } },
      categoryOrder: ['mteam-X', 'X'],
      commonPaths: [],
    }
    expect(await store.read()).toEqual(expected)
    // The documented first-read repair writes the whole file back.
    expect(await readJson()).toEqual(expected)
    expect(await modeOf(file())).toBe(0o600)
    expect(events('settings_section_filled')).toEqual([
      expect.objectContaining({ section: 'commonPaths' }),
    ])
  })

  it('version null is read as version 1 and repaired', async () => {
    await writeRaw({ version: null, categoryOrder: ['X'] })
    expect(await store.read()).toEqual({
      ...defaultSettings(),
      categoryOrder: ['X'],
    })
    expect(await readJson()).toEqual({
      ...defaultSettings(),
      categoryOrder: ['X'],
    })
  })

  it('a file without version is read as version 1', async () => {
    await writeRaw({ categoryOrder: ['X'] })
    expect(await store.read()).toEqual({
      ...defaultSettings(),
      categoryOrder: ['X'],
    })
  })

  it('a section of the wrong type gets its default and is logged', async () => {
    await writeRaw({
      version: 1,
      categorySort: [],
      categoryOrder: ['X'],
      commonPaths: 'x',
    })
    expect(await store.read()).toEqual({
      ...defaultSettings(),
      categoryOrder: ['X'],
    })
    expect(
      events('settings_section_invalid').map((line) => line.section),
    ).toEqual(['categorySort', 'commonPaths'])
  })

  it('an unknown top-level key is dropped', async () => {
    await writeRaw({ ...defaultSettings(), extra: { secret: 1 } })
    expect(await store.read()).toEqual(defaultSettings())
    expect(await readJson()).toEqual(defaultSettings())
  })
})

describe('broken file (row 3)', () => {
  it.each([
    ['unparseable JSON', '{not json'],
    ['an array', '[1, 2]'],
    ['null', 'null'],
    ['a string', '"mteam-X"'],
    ['a bad version', JSON.stringify({ version: 'one' })],
    ['version 0', JSON.stringify({ version: 0 })],
  ])(
    '%s: kept as settings.json.broken-<ts>, defaults written, logged without content',
    async (_name, content) => {
      await writeRaw(content)
      expect(await store.read()).toEqual(defaultSettings())
      const kept = 'settings.json.broken-20261118T093012.345Z'
      expect(await readFile(join(dir, kept), 'utf8')).toBe(content)
      expect(await modeOf(join(dir, kept))).toBe(0o600)
      expect(await readJson()).toEqual(defaultSettings())
      expect(await modeOf(file())).toBe(0o600)
      expect(events('settings_file_broken')).toEqual([
        expect.objectContaining({ file: SETTINGS_FILE, keptAs: kept }),
      ])
      expect(logText()).not.toContain('not json')
      expect(logText()).not.toContain('mteam-X')
      expect(logText()).not.toContain(dir)
    },
  )

  it('a write on a broken file also keeps it and starts from the defaults', async () => {
    await writeRaw('{not json')
    const result = await store.update(setSort(ALL, 'ratio', 'desc'))
    expect(result).toEqual({
      ok: true,
      settings: {
        ...defaultSettings(),
        categorySort: { [ALL]: { sort: 'ratio', dir: 'desc' } },
      },
    })
    const names = await readdir(dir)
    expect(
      names.filter((name) => name.startsWith('settings.json.broken-')),
    ).toHaveLength(1)
  })
})

describe('newer version (row 4)', () => {
  const newer = JSON.stringify({
    version: 2,
    categorySort: {},
    somethingNew: [],
  })

  it('the file is untouched, defaults are served, writes fail, logged once', async () => {
    await writeRaw(newer)
    expect(await store.read()).toEqual(defaultSettings())
    expect(await store.read()).toEqual(defaultSettings())
    expect(await store.update(setSort(ALL, 'ratio', 'desc'))).toEqual({
      ok: false,
    })
    expect(await store.update(setSort(ALL, 'name', 'asc'))).toEqual({
      ok: false,
    })
    expect(await readFile(file(), 'utf8')).toBe(newer)
    expect(await readdir(dir)).toEqual([SETTINGS_FILE])
    expect(events('settings_version_newer')).toEqual([
      expect.objectContaining({ version: 2, knownVersion: 1 }),
    ])
    expect(events('settings_write_failed')).toHaveLength(2)
  })
})

describe('unreadable file', () => {
  // root reads any file whatever its mode.
  it.skipIf(process.getuid?.() === 0)(
    'served as defaults, bytes kept, update refused, logged once with the code only',
    async () => {
      const content = JSON.stringify({
        ...defaultSettings(),
        categoryOrder: ['mteam-X'],
      })
      await writeRaw(content)
      await chmod(file(), 0o000)
      expect(await store.read()).toEqual(defaultSettings())
      expect(await store.read()).toEqual(defaultSettings())
      expect(await store.update(setSort(ALL, 'ratio', 'desc'))).toEqual({
        ok: false,
      })
      const failed = events('settings_read_failed')
      expect(failed).toHaveLength(1)
      const { time: _time, level: _level, event: _event, ...fields } = failed[0]
      expect(fields).toEqual({ code: 'EACCES' })
      await chmod(file(), 0o600)
      expect(await readFile(file(), 'utf8')).toBe(content)
      expect(logText()).not.toContain('mteam-X')
      expect(logText()).not.toContain(dir)
    },
  )
})

describe('invalid entry (row 5)', () => {
  it('one bad entry is dropped and logged (count only), the rest kept', async () => {
    await writeRaw({
      version: 1,
      categorySort: {
        'mteam-X': { sort: 'nope', dir: 'desc' },
        X: { sort: 'ratio', dir: 'asc' },
        [ALL]: { sort: 'seeding_time', dir: 'desc' },
        'bad\u0001key': { sort: 'ratio', dir: 'asc' },
      },
      categoryOrder: ['X', ALL, 'X', 5, 'mteam-X'],
      commonPaths: [
        { path: '/data/media/X', name: 'X', mediaLibrary: true },
        { path: '/database/x', name: 'outside', mediaLibrary: false },
        { path: '/data/../etc', name: 'dots', mediaLibrary: false },
        { path: '/data/media/X/', name: 'duplicate', mediaLibrary: false },
        { path: '/data/torrent', name: '', mediaLibrary: false },
      ],
    })
    expect(await store.read()).toEqual({
      version: 1,
      categorySort: {
        X: { sort: 'ratio', dir: 'asc' },
        [ALL]: { sort: 'seeding_time', dir: 'desc' },
      },
      categoryOrder: ['X', 'mteam-X'],
      commonPaths: [{ path: '/data/media/X', name: 'X', mediaLibrary: true }],
    })
    expect(
      events('settings_entries_dropped').map(({ section, count }) => ({
        section,
        count,
      })),
    ).toEqual([
      { section: 'categorySort', count: 2 },
      { section: 'categoryOrder', count: 3 },
      { section: 'commonPaths', count: 3 },
    ])
    expect(logText()).not.toContain('mteam-X')
    expect(logText()).not.toContain('/data')
  })

  it('a common path outside SAVE_ROOTS stays in the file but is not served', async () => {
    const inside = { path: '/data/media/X', name: 'X', mediaLibrary: true }
    const outside = {
      path: '/database/x',
      name: 'outside',
      mediaLibrary: false,
    }
    const file1 = { ...defaultSettings(), commonPaths: [inside, outside] }
    await writeRaw(file1)
    const before = await readFile(file(), 'utf8')
    expect((await store.read()).commonPaths).toEqual([inside])
    // Not a repair: the file is not written back.
    expect(await readFile(file(), 'utf8')).toBe(before)
    expect(events('settings_entries_dropped')).toEqual([])
    // A write keeps it too, and answers without it.
    const result = await store.update(setSort(ALL, 'ratio', 'desc'))
    expect(result.ok && result.settings.commonPaths).toEqual([inside])
    expect(await readJson()).toMatchObject({ commonPaths: [inside, outside] })
  })

  it('/data/./x and /data/x are one common path', async () => {
    await writeRaw({
      ...defaultSettings(),
      commonPaths: [
        { path: '/data/./x', name: 'first', mediaLibrary: false },
        { path: '/data/x', name: 'second', mediaLibrary: false },
      ],
    })
    expect((await store.read()).commonPaths).toEqual([
      { path: '/data/x', name: 'first', mediaLibrary: false },
    ])
  })

  it('a common path is stored normalized', async () => {
    await writeRaw({
      ...defaultSettings(),
      commonPaths: [{ path: '/data//media/X/', name: 'X', mediaLibrary: true }],
    })
    expect((await store.read()).commonPaths[0].path).toBe('/data/media/X')
    expect(await readJson()).toMatchObject({
      commonPaths: [{ path: '/data/media/X' }],
    })
  })

  it('only the first 50 common paths are kept', async () => {
    await writeRaw({
      ...defaultSettings(),
      commonPaths: Array.from({ length: 52 }, (_, i) => ({
        path: `/data/p${i}`,
        name: `p${i}`,
        mediaLibrary: false,
      })),
    })
    const { commonPaths } = await store.read()
    expect(commonPaths).toHaveLength(50)
    expect(commonPaths[49].path).toBe('/data/p49')
  })

  it('a __proto__ key is dropped and never becomes a prototype', async () => {
    await writeRaw(
      '{"version":1,"categorySort":{"__proto__":{"sort":"ratio","dir":"asc"}},"categoryOrder":[],"commonPaths":[]}',
    )
    const settings = await store.read()
    expect(Object.getPrototypeOf(settings.categorySort)).toBe(Object.prototype)
    expect(Object.keys(settings.categorySort)).toEqual([])
  })
})

describe('writes', () => {
  it('row 6: 20 concurrent writes all survive', async () => {
    const keys = Array.from({ length: 20 }, (_, i) => `mteam-X-${i}`)
    const results = await Promise.all(
      keys.map((key) => store.update(setSort(key, 'ratio', 'asc'))),
    )
    expect(results.every((result) => result.ok)).toBe(true)
    const saved = (await readJson()) as Settings
    expect(Object.keys(saved.categorySort).sort()).toEqual([...keys].sort())
    // No temp file left behind.
    expect(await readdir(dir)).toEqual([SETTINGS_FILE])
  })

  it('row 7: over 256 KB is refused and the file stays unchanged', async () => {
    await store.update(setSort(ALL, 'ratio', 'desc'))
    const before = await readFile(file(), 'utf8')
    const result = await store.update((current) => ({
      ...current,
      categorySort: Object.fromEntries(
        Array.from({ length: 5000 }, (_, i) => [
          `mteam-X-${String(i).padStart(4, '0')}`,
          { sort: 'seeding_time', dir: 'desc' },
        ]),
      ),
    }))
    expect(MAX_SETTINGS_BYTES).toBe(262_144)
    expect(result).toEqual({ ok: false })
    expect(await readFile(file(), 'utf8')).toBe(before)
    expect(events('settings_write_failed')).toEqual([
      expect.objectContaining({ reason: 'too_large', maxBytes: 262_144 }),
    ])
  })

  it('mode 600 after every write, whatever the file had', async () => {
    await writeRaw(defaultSettings())
    await chmod(file(), 0o644)
    await store.update(setSort(ALL, 'ratio', 'desc'))
    expect(await modeOf(file())).toBe(0o600)
  })

  it('the same change twice is idempotent and not written again', async () => {
    const first = await store.update(setSort(ALL, 'ratio', 'desc'))
    const before = (await stat(file())).mtimeMs
    await new Promise((resolve) => setTimeout(resolve, 20))
    const second = await store.update(setSort(ALL, 'ratio', 'desc'))
    expect(second).toEqual(first)
    expect((await stat(file())).mtimeMs).toBe(before)
  })

  // root ignores folder permissions.
  it.skipIf(process.getuid?.() === 0)(
    'a folder it cannot write to: the write fails, logged with the errno code only',
    async () => {
      await store.read()
      await chmod(dir, 0o500)
      expect(await store.update(setSort(ALL, 'ratio', 'desc'))).toEqual({
        ok: false,
      })
      expect(events('settings_write_failed')).toEqual([
        expect.objectContaining({
          file: SETTINGS_FILE,
          reason: 'io',
          code: 'EACCES',
        }),
      ])
      expect(logText()).not.toContain(dir)
      await chmod(dir, 0o700)
      expect(await readJson()).toEqual(defaultSettings())
    },
  )

  it('a later read sees the written settings', async () => {
    await store.update(setSort(ALL, 'name', 'asc'))
    expect((await makeStore().read()).categorySort[ALL]).toEqual({
      sort: 'name',
      dir: 'asc',
    })
  })
})

describe('migrations', () => {
  it('version 1 needs none: the raw object comes back as is', () => {
    const raw = { version: 1, categoryOrder: [] }
    expect(migrateSettings(raw, 1)).toBe(raw)
  })
})

describe('isUnderSaveRoot (the container half of the path schema)', () => {
  it.each([
    ['/data', true],
    ['/data/media/X', true],
    ['/database', false],
    ['/database/x', false],
    ['/other', false],
    ['/', false],
  ])('%s under /data: %s', (path, expected) => {
    expect(isUnderSaveRoot(path, ['/data'])).toBe(expected)
  })

  it('any of several roots', () => {
    expect(isUnderSaveRoot('/mnt/b/x', ['/data', '/mnt/b'])).toBe(true)
  })
})
