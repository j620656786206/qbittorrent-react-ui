import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MAX_COMMON_PATH_NAME, settingsSchema } from '#/shared/settings'

// Story 5.1: every common-path seed of scripts/fake-qbit.mjs (kept in
// scripts/fake-settings-seeds.mjs) parses with the real settings schema
// and comes back unchanged, so a schema change cannot silently break the
// e2e seeds. Fake folders under /data only (SAVE_ROOTS of the fake run).

const SCRIPTS = join(import.meta.dirname, '..', '..', 'scripts')

interface SeedsModule {
  SETTINGS_SEEDS: Record<string, Array<unknown>>
  VARIED_PARENTS: Array<string>
  LONG_NAME: string
  seedFile: (commonPaths: Array<unknown>) => unknown
}

// A computed URL, so the type checker does not look for the .mjs types.
const load = () =>
  import(
    pathToFileURL(join(SCRIPTS, 'fake-settings-seeds.mjs')).href
  ) as Promise<SeedsModule>

describe('fake-qbit settings seeds', () => {
  it('every seed is a valid settings file, unchanged by parsing', async () => {
    const { SETTINGS_SEEDS, seedFile } = await load()
    const names = Object.keys(SETTINGS_SEEDS)
    expect(names.sort()).toEqual([
      'fifty',
      'fifty-renamed',
      'library',
      'library-long',
      'library-renamed',
    ])
    for (const name of names) {
      const file = seedFile(SETTINGS_SEEDS[name])
      const parsed = settingsSchema.safeParse(file)
      expect(parsed.success, `${name}: ${parsed.error?.message}`).toBe(true)
      expect(parsed.data, name).toEqual(file)
      for (const entry of parsed.data?.commonPaths ?? []) {
        expect(entry.path.startsWith('/data/'), entry.path).toBe(true)
      }
    }
  })

  it('the long name is near the limit; fifty covers every varied parent', async () => {
    const { LONG_NAME, SETTINGS_SEEDS, VARIED_PARENTS } = await load()
    expect(LONG_NAME.length).toBeGreaterThan(30)
    expect(LONG_NAME.length).toBeLessThanOrEqual(MAX_COMMON_PATH_NAME)
    expect(VARIED_PARENTS).toHaveLength(50)
    expect(
      (SETTINGS_SEEDS.fifty as Array<{ path: string }>).map(
        (entry) => entry.path,
      ),
    ).toEqual(VARIED_PARENTS)
  })

  it('fake-qbit takes its seeds from that module', () => {
    const source = readFileSync(join(SCRIPTS, 'fake-qbit.mjs'), 'utf8')
    expect(source).toContain("from './fake-settings-seeds.mjs'")
    expect(source).not.toMatch(/const SETTINGS_SEEDS\b/)
  })
})
