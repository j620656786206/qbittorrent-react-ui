import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testSession } from '#/server/auth/testing'
import { resetEnvCache } from '#/server/env'
import { GUARDED, input } from '#/server/functions/_define'
import type { Guarded } from '#/server/functions/_define'
import { addCommonPath } from '#/server/functions/add-common-path'
import { DEFAULT_BODY_LIMIT } from '#/server/gate/body-limit'
import { stubTestEnv } from '#/server/gate/testing'
import { captureStdout } from '#/server/qbit/testing'
import { resetSettingsStoreForTests } from '#/server/settings'
import { ERROR_MESSAGES } from '#/shared/errors'
import type { Result } from '#/shared/errors'
import {
  MAX_COMMON_PATHS,
  addCommonPathInputSchema,
  defaultSettings,
} from '#/shared/settings'
import type { Settings } from '#/shared/settings'

// Spec 5.2 rows C1 to C4: addCommonPath through the real factory, with
// CONFIG_DIR pointed at a temporary folder (never ./config) and
// `SAVE_ROOTS=/downloads`. No qBittorrent is involved.

const guardedOf = (fn: unknown) => (fn as Record<symbol, Guarded>)[GUARDED]

type Session = ReturnType<typeof testSession> | null

function run(value: unknown, session: Session = testSession()) {
  return guardedOf(addCommonPath).run({
    data: input(addCommonPathInputSchema)(value as never),
    context: { session },
  }) as Promise<Result<Settings>>
}

const settingsFile = () => join(dir, 'settings.json')
const stored = async () =>
  JSON.parse(await readFile(settingsFile(), 'utf8')) as Settings

let dir: string
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rt-add-common-path-'))
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

describe('addCommonPath (spec 5.2)', () => {
  it('is a gated POST function with the default body limit', () => {
    const guarded = guardedOf(addCommonPath)
    expect(guarded.spec.auth).toBeUndefined()
    expect(guarded.spec.name).toBe('addCommonPath')
    expect(guarded.spec.bodyLimit ?? DEFAULT_BODY_LIMIT).toBe(
      DEFAULT_BODY_LIMIT,
    )
    expect((addCommonPath as unknown as { method: string }).method).toBe('POST')
  })

  it('no session: not_logged_in, nothing written', async () => {
    expect(
      await run(
        {
          path: '/downloads/media/anime',
          name: 'media/anime',
          mediaLibrary: false,
        },
        null,
      ),
    ).toMatchObject({ ok: false, error: { code: 'not_logged_in' } })
    await expect(readFile(settingsFile())).rejects.toThrow()
  })

  it('C1 a new path is appended and the whole settings come back', async () => {
    const result = await run({
      path: '/downloads/media/anime',
      name: '  media/anime  ',
      mediaLibrary: false,
    })
    const expected: Settings = {
      ...defaultSettings(),
      commonPaths: [
        {
          path: '/downloads/media/anime',
          name: 'media/anime',
          mediaLibrary: false,
        },
      ],
    }
    expect(result).toEqual({ ok: true, data: expected })
    expect(await stored()).toEqual(expected)
  })

  it('C2 the same path twice (then with a trailing slash): one entry, the first unchanged', async () => {
    await run({
      path: '/downloads/media/anime',
      name: 'media/anime',
      mediaLibrary: true,
    })
    const again = await run({
      path: '/downloads/media/anime/',
      name: 'other',
      mediaLibrary: false,
    })
    const expected = [
      {
        path: '/downloads/media/anime',
        name: 'media/anime',
        mediaLibrary: true,
      },
    ]
    expect(again).toEqual({
      ok: true,
      data: { ...defaultSettings(), commonPaths: expected },
    })
    expect((await stored()).commonPaths).toEqual(expected)
  })

  it.each([
    [
      'a .. segment',
      { path: '/downloads/../etc', name: 'x', mediaLibrary: false },
    ],
    ['outside the roots', { path: '/etc', name: 'x', mediaLibrary: false }],
    [
      'a relative path',
      { path: 'downloads/x', name: 'x', mediaLibrary: false },
    ],
    [
      'a blank name',
      { path: '/downloads/x', name: '   ', mediaLibrary: false },
    ],
    [
      'a 51-character name',
      { path: '/downloads/x', name: 'n'.repeat(51), mediaLibrary: false },
    ],
    [
      'a line break in the name',
      { path: '/downloads/x', name: 'a\nb', mediaLibrary: false },
    ],
    ['no mediaLibrary', { path: '/downloads/x', name: 'x' }],
    [
      'an extra key',
      { path: '/downloads/x', name: 'x', mediaLibrary: false, y: 1 },
    ],
  ])('C3 %s: invalid_input, nothing written', async (_name, value) => {
    expect(await run(value)).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: ERROR_MESSAGES.invalid_input },
    })
    await expect(readFile(settingsFile())).rejects.toThrow()
  })

  it('a 50-character name after trimming is accepted', async () => {
    const name = 'n'.repeat(50)
    const result = await run({
      path: '/downloads/x',
      name: ` ${name} `,
      mediaLibrary: false,
    })
    expect(result.ok && result.data.commonPaths[0].name).toBe(name)
  })

  it('C4 50 stored: a new path is invalid_input, an already-listed one still succeeds', async () => {
    const full: Settings = {
      ...defaultSettings(),
      commonPaths: Array.from({ length: MAX_COMMON_PATHS }, (_, index) => ({
        path: `/downloads/p${index}`,
        name: `p${index}`,
        mediaLibrary: false,
      })),
    }
    await writeFile(settingsFile(), JSON.stringify(full))
    expect(
      await run({ path: '/downloads/new', name: 'new', mediaLibrary: false }),
    ).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: ERROR_MESSAGES.invalid_input },
    })
    expect(await stored()).toEqual(full)
    expect(
      await run({ path: '/downloads/p3/', name: 'again', mediaLibrary: true }),
    ).toEqual({ ok: true, data: full })
  })

  it('a newer file version: settings_write_failed, the file untouched', async () => {
    const newer = JSON.stringify({ version: 2 })
    await writeFile(settingsFile(), newer)
    expect(
      await run({ path: '/downloads/x', name: 'x', mediaLibrary: false }),
    ).toEqual({
      ok: false,
      error: {
        code: 'settings_write_failed',
        message: ERROR_MESSAGES.settings_write_failed,
      },
    })
    expect(await readFile(settingsFile(), 'utf8')).toBe(newer)
  })
})
