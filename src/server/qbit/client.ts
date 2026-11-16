import { rawMaindataSchema } from '#/server/qbit/maindata-schema'
import type { RawMaindata } from '#/server/qbit/maindata-schema'
import { BadMaindata, issuePaths } from '#/server/qbit/bad-maindata'
import { QBIT_PATHS } from '#/server/qbit/paths'
import { createQbitSession } from '#/server/qbit/session'
import type { QbitSessionOptions } from '#/server/qbit/session'

// AD-5 / AR-24: the whitelist. One named method per qBittorrent endpoint the
// app uses, constant paths only, parameters built with URLSearchParams. No
// generic `/api/v2/*` forwarding, no preferences, no path from caller input.

export { QBIT_PATHS }

export interface QbitClient {
  /** `sync/maindata` with the container's own `rid`, parsed and stripped. */
  syncMaindata: (rid: number) => Promise<RawMaindata>
}

export function createQbitClient(options: QbitSessionOptions): QbitClient {
  const session = createQbitSession(options)

  async function syncMaindata(rid: number): Promise<RawMaindata> {
    const path = QBIT_PATHS.syncMaindata
    const query = new URLSearchParams()
    query.set('rid', String(rid))
    const response = await session.send(path, { method: 'GET', query })
    let json: unknown
    try {
      json = JSON.parse(response.body)
    } catch {
      throw new BadMaindata('not_json')
    }
    // The syncer logs it (`qbit_bad_maindata`) and asks for a full update.
    const parsed = rawMaindataSchema.safeParse(json)
    if (!parsed.success) {
      throw new BadMaindata('schema', issuePaths(parsed.error.issues))
    }
    return parsed.data
  }

  return Object.freeze({ syncMaindata })
}
