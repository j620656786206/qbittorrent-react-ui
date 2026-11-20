import { describe, expect, it } from 'vitest'
import { GUARDED } from './_define'
import type { Guarded } from './_define'

// AD-5 / AR-25: every export of a module under src/server/functions must come
// from the factory, and all but `login` must answer not_logged_in without a
// session. New files, in subfolders too, are picked up automatically by the
// glob (`__fixtures__/nested/` proves the `**` form reaches subfolders).

type Modules = Record<string, Record<string, unknown>>

const realModules: Modules = import.meta.glob(
  [
    './**/*.{ts,tsx}',
    '!./**/_*.{ts,tsx}',
    '!./**/*.test.{ts,tsx}',
    '!./__fixtures__/**',
  ],
  { eager: true },
)
const fixtureModules: Modules = import.meta.glob(
  ['./__fixtures__/**/*.{ts,tsx}'],
  { eager: true },
)

const PUBLIC_NAME = 'login'

function guardedOf(value: unknown): Guarded | undefined {
  if (typeof value !== 'function') return undefined
  const guarded = (value as unknown as Record<symbol, Guarded | undefined>)[
    GUARDED
  ]
  const isServerFn =
    typeof (value as { __executeServer?: unknown }).__executeServer ===
    'function'
  return guarded && isServerFn ? guarded : undefined
}

/** One line per export that breaks the rule; empty means all good. */
async function auditServerFunctions(modules: Modules): Promise<Array<string>> {
  const problems: Array<string> = []
  for (const [file, exports] of Object.entries(modules)) {
    for (const [name, value] of Object.entries(exports)) {
      const where = `${file}#${name}`
      const guarded = guardedOf(value)
      if (!guarded) {
        problems.push(`${where}: not a server function from _define.ts`)
        continue
      }
      if (name === PUBLIC_NAME) continue
      if (guarded.spec.auth === 'public') {
        problems.push(
          `${where}: auth 'public' is only allowed for ${PUBLIC_NAME}`,
        )
        continue
      }
      const result = await guarded.run({ data: undefined, context: {} })
      if (result.ok || result.error.code !== 'not_logged_in') {
        problems.push(
          `${where}: does not return not_logged_in without a session`,
        )
      }
    }
  }
  return problems
}

describe('server function discovery', () => {
  it('every real server function requires login except login', async () => {
    expect(await auditServerFunctions(realModules)).toEqual([])
  })

  it('finds the real login, getSession, getMaindata, getSortKeys, getTorrentDetail, stopTorrents, startTorrents, deleteTorrents, addTorrents, getFiles, setFilePriority, getErrorReasons, getSettings, setCategorySort and setCategoryOrder functions', () => {
    const found = Object.entries(realModules).flatMap(([file, exports]) =>
      Object.keys(exports).map((name) => `${file}#${name}`),
    )
    expect(found).toContain('./login.ts#login')
    expect(found).toContain('./get-session.ts#getSession')
    expect(found).toContain('./get-maindata.ts#getMaindata')
    expect(found).toContain('./get-sort-keys.ts#getSortKeys')
    expect(found).toContain('./get-torrent-detail.ts#getTorrentDetail')
    expect(found).toContain('./stop-torrents.ts#stopTorrents')
    expect(found).toContain('./start-torrents.ts#startTorrents')
    expect(found).toContain('./delete-torrents.ts#deleteTorrents')
    expect(found).toContain('./add-torrents.ts#addTorrents')
    expect(found).toContain('./get-files.ts#getFiles')
    expect(found).toContain('./set-file-priority.ts#setFilePriority')
    expect(found).toContain('./get-error-reasons.ts#getErrorReasons')
    expect(found).toContain('./get-settings.ts#getSettings')
    expect(found).toContain('./set-category-sort.ts#setCategorySort')
    expect(found).toContain('./set-category-order.ts#setCategoryOrder')
    expect(guardedOf(realModules['./login.ts'].login)?.spec.auth).toBe('public')
  })

  it('finds at least one real server function', () => {
    expect(Object.keys(realModules).length).toBeGreaterThan(0)
  })

  it('the glob skips _define.ts, tests and fixtures', () => {
    for (const file of Object.keys(realModules)) {
      expect(file).not.toMatch(/(^|\/)_[^/]*$|\.test\.tsx?$|__fixtures__/)
    }
  })

  it('the helper catches non-factory exports and public functions other than login', async () => {
    expect(Object.keys(fixtureModules).sort()).toEqual([
      './__fixtures__/nested/unguarded.ts',
      './__fixtures__/plain.ts',
      './__fixtures__/public-login.ts',
      './__fixtures__/sample.ts',
    ])
    expect(await auditServerFunctions(fixtureModules)).toEqual([
      './__fixtures__/nested/unguarded.ts#nestedPlain: not a server function from _define.ts',
      './__fixtures__/plain.ts#notAServerFn: not a server function from _define.ts',
      "./__fixtures__/public-login.ts#publicLeak: auth 'public' is only allowed for login",
    ])
  })

  it('the helper accepts the gated fixture and the fake login', async () => {
    const { plain: _plain, ...rest } = {
      plain: fixtureModules['./__fixtures__/plain.ts'],
      sample: fixtureModules['./__fixtures__/sample.ts'],
      login: { login: fixtureModules['./__fixtures__/public-login.ts'].login },
    }
    expect(await auditServerFunctions(rest)).toEqual([])
  })
})
