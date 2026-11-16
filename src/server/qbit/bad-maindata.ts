import type { z } from 'zod'
import { ServerFailure } from '#/server/errors/server-failure'

// A maindata answer the container cannot use. The syncer logs it as
// `qbit_bad_maindata` (reason plus field paths, never values) and asks for a
// full update next, so qBittorrent does not resend the same delta forever.

export type BadMaindataReason =
  | 'not_json'
  | 'schema'
  | 'not_hash'
  | 'incomplete_torrent'
  | 'incomplete_category'
  | 'incomplete_server_state'

const MAX_PATHS = 10
// Under these the second segment is a torrent hash or a category name: data,
// and a category name may be the private one.
const KEYED = new Set(['torrents', 'categories'])

/** Field paths of zod issues, record keys replaced by `*`, at most 10. */
export function issuePaths(
  issues: ReadonlyArray<z.core.$ZodIssue>,
  prefix: Array<string> = [],
): Array<string> {
  const paths = issues.map((issue) => {
    const path = [...prefix, ...issue.path.map(String)]
    return path
      .map((segment, index) =>
        index === 1 && KEYED.has(path[0]) ? '*' : segment,
      )
      .join('.')
  })
  return [...new Set(paths)].slice(0, MAX_PATHS)
}

export class BadMaindata extends ServerFailure {
  readonly reason: BadMaindataReason
  readonly issues: Array<string>

  constructor(reason: BadMaindataReason, issues: Array<string> = []) {
    super('qbit_rejected', `maindata: ${reason}`)
    this.reason = reason
    this.issues = issues
  }
}
