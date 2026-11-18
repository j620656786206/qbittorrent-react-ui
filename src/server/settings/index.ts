import { getEnv } from '#/server/env'
import { createSettingsStore } from '#/server/settings/store'
import type { SettingsStore } from '#/server/settings/store'

// AD-8: one settings store per container (one lock queue for the file),
// built on first use from the env's CONFIG_DIR and SAVE_ROOTS.

let store: SettingsStore | undefined

export function getSettingsStore(): SettingsStore {
  if (store === undefined) {
    const env = getEnv()
    store = createSettingsStore({
      dir: env.configDir,
      saveRoots: env.saveRoots,
    })
  }
  return store
}

/** Tests only: the next call builds a new store from the (stubbed) env. */
export function resetSettingsStoreForTests(): void {
  store = undefined
}
