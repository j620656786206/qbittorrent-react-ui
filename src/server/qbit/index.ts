import { getEnv } from '#/server/env'
import { createQbitClient } from '#/server/qbit/client'
import type { QbitClient } from '#/server/qbit/client'

export { QBIT_PATHS } from '#/server/qbit/client'
export { QBIT_DEADLINE_MS } from '#/server/qbit/session'
export type { AddTorrentEntry, QbitClient } from '#/server/qbit/client'

// One client, hence one qBittorrent session, per container. Built on first
// use so importing a server function module reads no env (the discovery test
// imports them all). `fetch` is looked up on `globalThis` per request.

let client: QbitClient | undefined

export function getQbitClient(): QbitClient {
  if (!client) {
    const env = getEnv()
    client = createQbitClient({
      baseUrl: env.qbitUrl,
      username: env.qbitUsername,
      password: env.qbitPassword,
    })
  }
  return client
}

/** Tests only, like `resetEnvCache`: forget the session and its breaker. */
export function resetQbitClientForTests(): void {
  client = undefined
}
