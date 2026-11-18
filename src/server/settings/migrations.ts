import { SETTINGS_VERSION } from '#/shared/settings'

// AD-8: every settings migration lives here. `version` only goes up when an
// existing field changes meaning; a migration takes the raw object of
// version N and returns the raw object of version N + 1 (the store checks
// each entry afterwards). Version 1 is the first, so there is none yet.

export type RawSettings = Record<string, unknown>

export const SETTINGS_MIGRATIONS: Readonly<
  Partial<Record<number, (raw: RawSettings) => RawSettings>>
> = {}

/**
 * `raw` brought from `from` up to SETTINGS_VERSION, or `null` when a step
 * is missing (the store then treats the file as broken).
 */
export function migrateSettings(
  raw: RawSettings,
  from: number,
): RawSettings | null {
  let current = raw
  for (let version = from; version < SETTINGS_VERSION; version += 1) {
    const step = SETTINGS_MIGRATIONS[version]
    if (step === undefined) return null
    current = { ...step(current), version: version + 1 }
  }
  return current
}
