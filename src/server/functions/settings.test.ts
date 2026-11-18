import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testSession } from '#/server/auth/testing'
import { resetEnvCache } from '#/server/env'
import { GUARDED, input } from '#/server/functions/_define'
import type { Guarded } from '#/server/functions/_define'
import { getSettings } from '#/server/functions/get-settings'
import { setCategoryOrder } from '#/server/functions/set-category-order'
import { setCategorySort } from '#/server/functions/set-category-sort'
import { stubTestEnv } from '#/server/gate/testing'
import { captureStdout } from '#/server/qbit/testing'
import { resetSettingsStoreForTests } from '#/server/settings'
import { ALL } from '#/shared/categories'
import { ERROR_MESSAGES } from '#/shared/errors'
import type { Result } from '#/shared/errors'
import {
  defaultSettings,
  getSettingsInputSchema,
  setCategoryOrderInputSchema,
  setCategorySortInputSchema,
} from '#/shared/settings'
import type { Settings } from '#/shared/settings'

// Stories 3.1 and 3.3: getSettings, setCategorySort and setCategoryOrder
// through the real factory, with CONFIG_DIR pointed at a temporary folder
// (never ./config). No qBittorrent is involved: fetch is stubbed to fail
// the test if anything calls it.

const guardedOf = (fn: unknown) => (fn as Record<symbol, Guarded>)[GUARDED]

type Session = ReturnType<typeof testSession> | null

function runGet(value: unknown = undefined, session: Session = testSession()) {
  return guardedOf(getSettings).run({
    data: input(getSettingsInputSchema)(value as never),
    context: { session },
  }) as Promise<Result<Settings>>
}

function runSet(value: unknown, session: Session = testSession()) {
  return guardedOf(setCategorySort).run({
    data: input(setCategorySortInputSchema)(value as never),
    context: { session },
  }) as Promise<Result<Settings>>
}

function runOrder(value: unknown, session: Session = testSession()) {
  return guardedOf(setCategoryOrder).run({
    data: input(setCategoryOrderInputSchema)(value as never),
    context: { session },
  }) as Promise<Result<Settings>>
}

const settingsFile = () => join(dir, 'settings.json')

let dir: string
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rt-settings-fn-'))
  stubTestEnv()
  vi.stubEnv('CONFIG_DIR', dir)
  resetEnvCache()
  resetSettingsStoreForTests()
  captureStdout()
  fetchSpy = vi.fn(() => Promise.reject(new Error('no network in this test')))
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(async () => {
  expect(fetchSpy).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  resetEnvCache()
  resetSettingsStoreForTests()
  await rm(dir, { recursive: true, force: true })
})

describe('getSettings', () => {
  it('is a gated GET function named getSettings', () => {
    expect(guardedOf(getSettings).spec.auth).toBeUndefined()
    expect(guardedOf(getSettings).spec.name).toBe('getSettings')
    expect((getSettings as unknown as { method: string }).method).toBe('GET')
  })

  it('first start: the defaults, and the file is created', async () => {
    expect(await runGet()).toEqual({ ok: true, data: defaultSettings() })
    expect(JSON.parse(await readFile(settingsFile(), 'utf8'))).toEqual(
      defaultSettings(),
    )
  })

  it('an extra input: invalid_input', async () => {
    expect(await runGet({ any: 1 })).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: ERROR_MESSAGES.invalid_input },
    })
  })

  it('no session: not_logged_in, and the file is not touched', async () => {
    expect(await runGet(undefined, null)).toMatchObject({
      ok: false,
      error: { code: 'not_logged_in' },
    })
    await expect(readFile(settingsFile())).rejects.toThrow()
  })
})

describe('setCategorySort', () => {
  it('is a gated POST function named setCategorySort', () => {
    expect(guardedOf(setCategorySort).spec.auth).toBeUndefined()
    expect(guardedOf(setCategorySort).spec.name).toBe('setCategorySort')
    expect((setCategorySort as unknown as { method: string }).method).toBe(
      'POST',
    )
  })

  it('remembers the sort and answers the whole new settings', async () => {
    const result = await runSet({ category: ALL, sort: 'ratio', dir: 'desc' })
    const expected = {
      ...defaultSettings(),
      categorySort: { [ALL]: { sort: 'ratio', dir: 'desc' } },
    }
    expect(result).toEqual({ ok: true, data: expected })
    expect(await runGet()).toEqual({ ok: true, data: expected })
  })

  it('keeps the other categories and replaces the same one', async () => {
    await runSet({ category: 'mteam-X', sort: 'name', dir: 'asc' })
    await runSet({ category: ALL, sort: 'ratio', dir: 'desc' })
    const result = await runSet({
      category: ALL,
      sort: 'seeding_time',
      dir: 'asc',
    })
    expect(result.ok && result.data.categorySort).toEqual({
      'mteam-X': { sort: 'name', dir: 'asc' },
      [ALL]: { sort: 'seeding_time', dir: 'asc' },
    })
  })

  it('idempotent: the same call twice gives the same settings', async () => {
    const value = { category: '', sort: 'added_on', dir: 'asc' }
    const first = await runSet(value)
    const second = await runSet(value)
    expect(second).toEqual(first)
  })

  it.each([
    ['a bad sort', { category: ALL, sort: 'nope', dir: 'desc' }],
    ['a bad dir', { category: ALL, sort: 'ratio', dir: 'up' }],
    ['an unknown key', { category: ALL, sort: 'ratio', dir: 'desc', x: 1 }],
    [
      'a control character',
      { category: 'X\u0007', sort: 'ratio', dir: 'desc' },
    ],
    ['no category', { sort: 'ratio', dir: 'desc' }],
    ['nothing', undefined],
  ])('%s: invalid_input, nothing written', async (_name, value) => {
    expect(await runSet(value)).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: ERROR_MESSAGES.invalid_input },
    })
    await expect(readFile(settingsFile())).rejects.toThrow()
  })

  it('a newer file version: settings_write_failed, the file untouched', async () => {
    const newer = JSON.stringify({ version: 2 })
    await writeFile(settingsFile(), newer)
    expect(await runSet({ category: ALL, sort: 'ratio', dir: 'desc' })).toEqual(
      {
        ok: false,
        error: {
          code: 'settings_write_failed',
          message: ERROR_MESSAGES.settings_write_failed,
        },
      },
    )
    expect(await readFile(settingsFile(), 'utf8')).toBe(newer)
    // Reads still answer the defaults.
    expect(await runGet()).toEqual({ ok: true, data: defaultSettings() })
  })

  it('no session: not_logged_in, nothing written', async () => {
    expect(
      await runSet({ category: ALL, sort: 'ratio', dir: 'desc' }, null),
    ).toMatchObject({ ok: false, error: { code: 'not_logged_in' } })
    await expect(readFile(settingsFile())).rejects.toThrow()
  })

  it('20 concurrent calls all survive', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        runSet({ category: `mteam-X-${i}`, sort: 'ratio', dir: 'asc' }),
      ),
    )
    const result = await runGet()
    expect(result.ok && Object.keys(result.data.categorySort)).toHaveLength(20)
  })
})

describe('setCategoryOrder (story 3.3)', () => {
  it('is a gated POST function named setCategoryOrder', () => {
    expect(guardedOf(setCategoryOrder).spec.auth).toBeUndefined()
    expect(guardedOf(setCategoryOrder).spec.name).toBe('setCategoryOrder')
    expect((setCategoryOrder as unknown as { method: string }).method).toBe(
      'POST',
    )
  })

  it('stores the whole order and answers the whole new settings', async () => {
    await runSet({ category: 'mteam-X', sort: 'ratio', dir: 'desc' })
    const result = await runOrder({ order: ['b', 'c', 'a', '', 'mteam-X'] })
    const expected = {
      ...defaultSettings(),
      categorySort: { 'mteam-X': { sort: 'ratio', dir: 'desc' } },
      categoryOrder: ['b', 'c', 'a', '', 'mteam-X'],
    }
    expect(result).toEqual({ ok: true, data: expected })
    expect(await runGet()).toEqual({ ok: true, data: expected })
  })

  it('replaces the old order (a new order, not a move)', async () => {
    await runOrder({ order: ['a', 'b', 'c', 'd'] })
    const result = await runOrder({ order: ['c', 'a'] })
    expect(result.ok && result.data.categoryOrder).toEqual(['c', 'a'])
  })

  it('an empty order clears it', async () => {
    await runOrder({ order: ['a'] })
    const result = await runOrder({ order: [] })
    expect(result.ok && result.data.categoryOrder).toEqual([])
  })

  it('idempotent: the same call twice gives the same settings and file', async () => {
    const value = { order: ['b', 'c', 'a', 'd'] }
    const first = await runOrder(value)
    const file = await readFile(settingsFile(), 'utf8')
    const second = await runOrder(value)
    expect(second).toEqual(first)
    expect(await readFile(settingsFile(), 'utf8')).toBe(file)
  })

  it.each([
    ['ALL', { order: ['a', ALL] }],
    ['a duplicate', { order: ['a', 'b', 'a'] }],
    ['uncategorized twice', { order: ['', 'a', ''] }],
    ['a control character', { order: ['X\u0007'] }],
    ['__proto__', { order: ['__proto__'] }],
    ['a name over 255 characters', { order: ['x'.repeat(256)] }],
    ['not a string', { order: [1] }],
    ['not an array', { order: 'a' }],
    ['an unknown key', { order: ['a'], x: 1 }],
    ['no order', {}],
    ['nothing', undefined],
    [
      'over the 256 KB file bound',
      {
        order: Array.from(
          { length: 1100 },
          (_, i) => `${String(i).padStart(4, '0')}${'x'.repeat(251)}`,
        ),
      },
    ],
  ])('%s: invalid_input, nothing written', async (_name, value) => {
    expect(await runOrder(value)).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: ERROR_MESSAGES.invalid_input },
    })
    await expect(readFile(settingsFile())).rejects.toThrow()
  })

  it('a newer file version: settings_write_failed, the file untouched', async () => {
    const newer = JSON.stringify({ version: 2 })
    await writeFile(settingsFile(), newer)
    expect(await runOrder({ order: ['a'] })).toEqual({
      ok: false,
      error: {
        code: 'settings_write_failed',
        message: ERROR_MESSAGES.settings_write_failed,
      },
    })
    expect(await readFile(settingsFile(), 'utf8')).toBe(newer)
  })

  it('no session: not_logged_in, nothing written', async () => {
    expect(await runOrder({ order: ['a'] }, null)).toMatchObject({
      ok: false,
      error: { code: 'not_logged_in' },
    })
    await expect(readFile(settingsFile())).rejects.toThrow()
  })

  it('an order save and sort saves at once: none is lost', async () => {
    await Promise.all([
      runSet({ category: 'a', sort: 'ratio', dir: 'asc' }),
      runOrder({ order: ['b', 'a'] }),
      runSet({ category: 'b', sort: 'name', dir: 'desc' }),
    ])
    const result = await runGet()
    expect(result.ok && result.data.categoryOrder).toEqual(['b', 'a'])
    expect(result.ok && Object.keys(result.data.categorySort).sort()).toEqual([
      'a',
      'b',
    ])
  })
})
