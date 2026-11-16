import { describe, expect, it } from 'vitest'
import { GUARDED } from './_define'
import type { Guarded } from './_define'

// AD-5 / AR-25: every export of src/server/functions/*.ts must come from the
// factory, and all but `login` must answer not_logged_in without a session.
// New files, in subfolders too, are picked up automatically by the glob.

type Modules = Record<string, Record<string, unknown>>

const realModules: Modules = import.meta.glob(
  ['./*.ts', '!./_*.ts', '!./*.test.ts'],
  {
    eager: true,
  },
)
const fixtureModules: Modules = import.meta.glob(['./__fixtures__/*.ts'], {
  eager: true,
})

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

  it('finds the real login and getSession functions', () => {
    const found = Object.entries(realModules).flatMap(([file, exports]) =>
      Object.keys(exports).map((name) => `${file}#${name}`),
    )
    expect(found).toContain('./login.ts#login')
    expect(found).toContain('./get-session.ts#getSession')
    expect(guardedOf(realModules['./login.ts'].login)?.spec.auth).toBe('public')
  })

  it('the glob skips _define.ts, tests and fixtures', () => {
    for (const file of Object.keys(realModules)) {
      expect(file).not.toMatch(/(^|\/)_[^/]*$|\.test\.tsx?$|__fixtures__/)
    }
  })

  it('the helper catches non-factory exports and public functions other than login', async () => {
    expect(Object.keys(fixtureModules).sort()).toEqual([
      './__fixtures__/plain.ts',
      './__fixtures__/public-login.ts',
      './__fixtures__/sample.ts',
    ])
    expect(await auditServerFunctions(fixtureModules)).toEqual([
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
