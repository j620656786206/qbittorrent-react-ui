import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testSession } from '#/server/auth/testing'
import { resetEnvCache } from '#/server/env'
import { GUARDED, input } from '#/server/functions/_define'
import type { Guarded } from '#/server/functions/_define'
import { removeCommonPath } from '#/server/functions/remove-common-path'
import { updateCommonPath } from '#/server/functions/update-common-path'
import { DEFAULT_BODY_LIMIT } from '#/server/gate/body-limit'
import { stubTestEnv } from '#/server/gate/testing'
import { captureStdout } from '#/server/qbit/testing'
import { resetSettingsStoreForTests } from '#/server/settings'
import { ERROR_MESSAGES } from '#/shared/errors'
import type { Result } from '#/shared/errors'
import {
  defaultSettings,
  removeCommonPathInputSchema,
  updateCommonPathInputSchema,
} from '#/shared/settings'
import type { CommonPath, Settings } from '#/shared/settings'

// Spec 5.4 rows P1 to P6: updateCommonPath and removeCommonPath through the
// real factory, with CONFIG_DIR pointed at a temporary folder (never
// ./config) and `SAVE_ROOTS=/downloads`. No qBittorrent is involved.

const guardedOf = (fn: unknown) => (fn as Record<symbol, Guarded>)[GUARDED]

type Session = ReturnType<typeof testSession> | null

function runUpdate(value: unknown, session: Session = testSession()) {
  return guardedOf(updateCommonPath).run({
    data: input(updateCommonPathInputSchema)(value as never),
    context: { session },
  }) as Promise<Result<Settings>>
}

function runRemove(value: unknown, session: Session = testSession()) {
  return guardedOf(removeCommonPath).run({
    data: input(removeCommonPathInputSchema)(value as never),
    context: { session },
  }) as Promise<Result<Settings>>
}

const TV: CommonPath = {
  path: '/downloads/media/tv',
  name: 'media/tv',
  mediaLibrary: false,
}
const MOVIES: CommonPath = {
  path: '/downloads/media/movies',
  name: '電影媒體庫',
  mediaLibrary: true,
}
const SEED: CommonPath = {
  path: '/downloads/torrent/mteam-X',
  name: 'PT 做種',
  mediaLibrary: false,
}
const listed: Settings = {
  ...defaultSettings(),
  commonPaths: [TV, MOVIES, SEED],
}

const settingsFile = () => join(dir, 'settings.json')
const stored = async () =>
  JSON.parse(await readFile(settingsFile(), 'utf8')) as Settings
const seed = (settings: Settings) =>
  writeFile(settingsFile(), JSON.stringify(settings))

let dir: string
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rt-update-common-path-'))
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

const INVALID = {
  ok: false,
  error: { code: 'invalid_input', message: ERROR_MESSAGES.invalid_input },
}

describe('updateCommonPath (spec 5.4)', () => {
  it('is a gated POST function with the default body limit', () => {
    const guarded = guardedOf(updateCommonPath)
    expect(guarded.spec.auth).toBeUndefined()
    expect(guarded.spec.name).toBe('updateCommonPath')
    expect(guarded.spec.bodyLimit ?? DEFAULT_BODY_LIMIT).toBe(
      DEFAULT_BODY_LIMIT,
    )
    expect((updateCommonPath as unknown as { method: string }).method).toBe(
      'POST',
    )
  })

  it('no session: not_logged_in, nothing written', async () => {
    expect(
      await runUpdate({ path: TV.path, name: '影集' }, null),
    ).toMatchObject({ ok: false, error: { code: 'not_logged_in' } })
    await expect(readFile(settingsFile())).rejects.toThrow()
  })

  it('P1 rename: the entry found by its normalized path, the name trimmed, the whole settings back', async () => {
    await seed(listed)
    const result = await runUpdate({
      path: '/downloads/media/tv/',
      name: '  影集  ',
    })
    const expected: Settings = {
      ...listed,
      commonPaths: [{ ...TV, name: '影集' }, MOVIES, SEED],
    }
    expect(result).toEqual({ ok: true, data: expected })
    expect(await stored()).toEqual(expected)
  })

  it('a stored path with a trailing slash is found too (the store reads it normalized)', async () => {
    await seed({
      ...listed,
      commonPaths: [{ ...TV, path: '/downloads/media/tv/' }],
    })
    const result = await runUpdate({ path: TV.path, name: '影集' })
    expect(result.ok && result.data.commonPaths).toEqual([
      { ...TV, name: '影集' },
    ])
  })

  it.each([
    ['a blank name', { path: TV.path, name: '   ' }],
    ['a 51-character name', { path: TV.path, name: 'n'.repeat(51) }],
    ['a line break in the name', { path: TV.path, name: 'a\nb' }],
    ['neither name nor mediaLibrary', { path: TV.path }],
    ['a relative path', { path: 'downloads/media/tv', name: 'x' }],
    ['a .. segment', { path: '/downloads/../tv', name: 'x' }],
    ['an extra key', { path: TV.path, name: 'x', y: 1 }],
    [
      'a mediaLibrary that is not a boolean',
      { path: TV.path, mediaLibrary: 1 },
    ],
  ])('P2 %s: invalid_input, nothing written', async (_name, value) => {
    await seed(listed)
    expect(await runUpdate(value)).toEqual(INVALID)
    expect(await stored()).toEqual(listed)
  })

  it('a 50-character name after trimming is accepted', async () => {
    await seed(listed)
    const name = 'n'.repeat(50)
    const result = await runUpdate({ path: TV.path, name: ` ${name} ` })
    expect(result.ok && result.data.commonPaths[0].name).toBe(name)
  })

  it('P3 tick 「媒體庫」: that entry flagged, its name unchanged', async () => {
    await seed(listed)
    const result = await runUpdate({ path: TV.path, mediaLibrary: true })
    const expected = [{ ...TV, mediaLibrary: true }, MOVIES, SEED]
    expect(result.ok && result.data.commonPaths).toEqual(expected)
    expect((await stored()).commonPaths).toEqual(expected)
    const untick = await runUpdate({ path: MOVIES.path, mediaLibrary: false })
    expect(untick.ok && untick.data.commonPaths[1]).toEqual({
      ...MOVIES,
      mediaLibrary: false,
    })
  })

  it('name and mediaLibrary together change both', async () => {
    await seed(listed)
    const result = await runUpdate({
      path: SEED.path,
      name: '保種',
      mediaLibrary: true,
    })
    expect(result.ok && result.data.commonPaths[2]).toEqual({
      ...SEED,
      name: '保種',
      mediaLibrary: true,
    })
  })

  it('P4 a path not listed: success, the settings unchanged', async () => {
    await seed(listed)
    expect(await runUpdate({ path: '/downloads/gone', name: 'gone' })).toEqual({
      ok: true,
      data: listed,
    })
    expect(await stored()).toEqual(listed)
  })

  it('P5 two calls at once on different paths: both changes in the file', async () => {
    await seed(listed)
    await Promise.all([
      runUpdate({ path: TV.path, name: '影集' }),
      runUpdate({ path: MOVIES.path, mediaLibrary: false }),
      runRemove({ path: SEED.path }),
    ])
    expect((await stored()).commonPaths).toEqual([
      { ...TV, name: '影集' },
      { ...MOVIES, mediaLibrary: false },
    ])
  })

  it('a newer file version: settings_write_failed, the file untouched', async () => {
    const newer = JSON.stringify({ version: 2 })
    await writeFile(settingsFile(), newer)
    expect(await runUpdate({ path: TV.path, name: 'x' })).toEqual({
      ok: false,
      error: {
        code: 'settings_write_failed',
        message: ERROR_MESSAGES.settings_write_failed,
      },
    })
    expect(await readFile(settingsFile(), 'utf8')).toBe(newer)
  })
})

describe('removeCommonPath (spec 5.4)', () => {
  it('is a gated POST function with the default body limit', () => {
    const guarded = guardedOf(removeCommonPath)
    expect(guarded.spec.auth).toBeUndefined()
    expect(guarded.spec.name).toBe('removeCommonPath')
    expect(guarded.spec.bodyLimit ?? DEFAULT_BODY_LIMIT).toBe(
      DEFAULT_BODY_LIMIT,
    )
    expect((removeCommonPath as unknown as { method: string }).method).toBe(
      'POST',
    )
  })

  it('no session: not_logged_in, nothing written', async () => {
    expect(await runRemove({ path: TV.path }, null)).toMatchObject({
      ok: false,
      error: { code: 'not_logged_in' },
    })
    await expect(readFile(settingsFile())).rejects.toThrow()
  })

  it('P6 remove: the entry gone (found by its normalized path), the whole settings back, no fetch', async () => {
    await seed(listed)
    const result = await runRemove({ path: '/downloads/media/movies/' })
    const expected: Settings = { ...listed, commonPaths: [TV, SEED] }
    expect(result).toEqual({ ok: true, data: expected })
    expect(await stored()).toEqual(expected)
  })

  it('P4 a path not listed: success, the settings unchanged', async () => {
    await seed(listed)
    expect(await runRemove({ path: '/downloads/gone' })).toEqual({
      ok: true,
      data: listed,
    })
    expect(await stored()).toEqual(listed)
  })

  it('removing twice: both succeed, one entry gone', async () => {
    await seed(listed)
    await runRemove({ path: TV.path })
    expect(await runRemove({ path: TV.path })).toEqual({
      ok: true,
      data: { ...listed, commonPaths: [MOVIES, SEED] },
    })
  })

  it.each([
    ['a relative path', { path: 'downloads/x' }],
    ['a .. segment', { path: '/downloads/../x' }],
    ['no path', {}],
    ['an extra key', { path: TV.path, name: 'x' }],
  ])('%s: invalid_input, nothing written', async (_name, value) => {
    await seed(listed)
    expect(await runRemove(value)).toEqual(INVALID)
    expect(await stored()).toEqual(listed)
  })

  it('a newer file version: settings_write_failed, the file untouched', async () => {
    const newer = JSON.stringify({ version: 2 })
    await writeFile(settingsFile(), newer)
    expect(await runRemove({ path: TV.path })).toMatchObject({
      ok: false,
      error: { code: 'settings_write_failed' },
    })
    expect(await readFile(settingsFile(), 'utf8')).toBe(newer)
  })
})
