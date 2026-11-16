import type { MaindataVersion } from '#/shared/maindata'
import type { SortKeysResponse, SortValue } from '#/shared/sort-keys'

// Story 2.1, AD-6: the only producer of `['sort-keys', field]` data, like
// mergeMaindata for `['maindata']`. `full` replaces; a delta overwrites the
// hashes it carries. Nothing changed keeps the old `keys` reference, so the
// sort (a `select` keyed on it) does not rerun. Hashes of torrents that left
// maindata may linger: the sort only looks up visible hashes.

export interface SortKeysData {
  version: MaindataVersion
  keys: Readonly<Record<string, SortValue>>
}

const EMPTY: Readonly<Record<string, SortValue>> = Object.freeze({})

function sameKeys(
  a: Readonly<Record<string, SortValue>>,
  b: Readonly<Record<string, SortValue>>,
): boolean {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  return aKeys.every((hash) => Object.hasOwn(b, hash) && a[hash] === b[hash])
}

export function mergeSortKeys(
  previous: SortKeysData | undefined,
  response: SortKeysResponse,
): SortKeysData {
  const old = previous?.keys ?? EMPTY
  if (response.full) {
    const keys = sameKeys(old, response.keys) ? old : response.keys
    return { version: response.version, keys }
  }
  // Copy on first write, so an unchanged delta keeps the old record.
  let next: Record<string, SortValue> | null = null
  for (const [hash, value] of Object.entries(response.keys)) {
    if (Object.hasOwn(old, hash) && old[hash] === value) continue
    next ??= { ...old }
    next[hash] = value
  }
  return { version: response.version, keys: next ?? old }
}
