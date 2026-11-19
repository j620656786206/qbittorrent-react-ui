import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveCategory } from '#/lib/category-tabs'
import type { CategoryCounts } from '#/lib/category-tabs'
import type { Maindata } from '#/lib/maindata-merge'
import { readPref, withViewedHash, writePref } from '#/lib/prefs'
import { rememberedSortOf } from '#/lib/remembered-sort'
import { listsIn } from '#/lib/visible-torrents'
import { ALL } from '#/shared/categories'
import {
  DEFAULT_SORT_VIEW,
  PLACE_KEYS,
  normalizeSortView,
} from '#/shared/list-search'
import type { SortView } from '#/shared/list-search'
import type { Settings } from '#/shared/settings'
import { useMaindata } from '#/state/maindata'
import { useMaindataFailure } from '#/state/maindata-failure'

// Story 3.6: this device remembers where Alex was (src/lib/prefs.ts, never
// the NAS), for the `_authed` layout. On the list route, once maindata has
// answered, every category on screen is stored as `lastCategory`, and a
// `hash` Alex chose (a row, ‹ ›) as that category's entry of
// `lastViewedHash` when it is one of that category's rows (a stale or
// foreign link never replaces a good entry), also when that torrent only
// arrives in a later answer. A `hash` the app wrote by itself (the viewed
// row left the list, `noteHashWrite(hash, false)`) is never stored, so a
// search that hides the remembered torrent for a moment keeps it.
// The app opening with a bare URL (no `category`, `sort` or `hash`; `q`
// alone is still bare; on the list or the settings page) goes back to
// `lastCategory` with its remembered sort (else 「狀態」), through
// `restoreTo` once maindata and the settings answered; a category no
// torrent has any more stays 「全部」 (the bare URL already shows 「全部」
// with its remembered sort). The list keeps its skeleton while
// `restoring`, so the first entrance is the restored category's; it is no
// tab switch, so no hint. Off the list (the settings page) the restore
// waits and nothing is recorded; back on the list it runs if the URL is
// still bare. A place written meanwhile cancels it, so does a tab click
// (`cancel`), and so does a first maindata request that failed (the usual
// error state shows; a late answer never jumps to another category, and
// `lastCategory` is kept until Alex leaves the category he opened on or
// the URL names a place). Claude 代決: a URL whose only place params are
// invalid counts as bare; the router drops them before the layout runs,
// so it cannot be told from a bare one.

/**
 * `pending`: waiting for maindata, the settings and the list to go to
 * `category`; `navigating`: `restoreTo` is writing the URL; `held`: given
 * up after a failed first maindata request, so `lastCategory` is kept
 * until the screen leaves the category it opened on or the URL names a
 * place; `done`: nothing (left) to restore.
 */
type Restore =
  | { step: 'pending'; category: string }
  | { step: 'navigating'; category: string }
  | { step: 'held'; category: string }
  | { step: 'done' }

const RESTORED: Restore = { step: 'done' }

/** The (validated) search string names no place (`q` alone does not). */
function isBareSearch(searchStr: string): boolean {
  const params = new URLSearchParams(searchStr)
  return PLACE_KEYS.every((key) => !params.has(key))
}

function initialRestore(searchStr: string): Restore {
  if (!isBareSearch(searchStr)) return RESTORED
  const category = readPref('lastCategory')
  return category === ALL ? RESTORED : { step: 'pending', category }
}

export interface ResumeLastPlaceInput {
  /** The location's search string. */
  searchStr: string
  /** The list route is on screen. */
  onList: boolean
  /** The settings answered (or failed). */
  ready: boolean
  settings: Settings | undefined
  counts: CategoryCounts | undefined
  /** The category the URL asks for (`ALL` without one). */
  requestedCategory: string
  /** The category on screen (resolveCategory). */
  category: string
  /** The URL's `hash`. */
  hash: string | undefined
  /** Writes the list's URL on `category` with `view`, with `replace`. */
  restoreTo: (category: string, view: SortView) => Promise<unknown>
}

export interface ResumeLastPlace {
  /** The list waits (skeleton) for the restore. */
  restoring: boolean
  /** Alex chose a place (a tab click): nothing is restored any more. */
  cancel: () => void
  /**
   * Stable. Tells who writes `hash` next: Alex (`chosen`, it may be
   * remembered) or the app by itself (never remembered).
   */
  noteHashWrite: (hash: string | null, chosen: boolean) => void
}

export function useResumeLastPlace({
  searchStr,
  onList,
  ready,
  settings,
  counts,
  requestedCategory,
  category,
  hash,
  restoreTo,
}: ResumeLastPlaceInput): ResumeLastPlace {
  const maindataFailure = useMaindataFailure()
  const [restore, setRestore] = useState<Restore>(() =>
    initialRestore(searchStr),
  )
  const restoring =
    restore.step === 'pending' ||
    (restore.step === 'navigating' && requestedCategory !== restore.category)

  useEffect(() => {
    if (restore.step !== 'pending') return
    if (counts === undefined && maindataFailure !== null) {
      setRestore({ step: 'held', category })
      return
    }
    if (!onList || !ready || counts === undefined) return
    const target = restore.category
    if (
      !isBareSearch(searchStr) ||
      resolveCategory({ requested: target, counts, confirmed: null }).invalid
    ) {
      setRestore(RESTORED)
      return
    }
    const remembered = rememberedSortOf(settings, target)
    setRestore({ step: 'navigating', category: target })
    const finish = () => setRestore(RESTORED)
    restoreTo(
      target,
      remembered ? normalizeSortView(remembered) : DEFAULT_SORT_VIEW,
    ).then(finish, finish)
  }, [
    restore,
    category,
    ready,
    counts,
    maindataFailure,
    onList,
    searchStr,
    settings,
    restoreTo,
  ])

  const countsKnown = counts !== undefined
  useEffect(() => {
    if (!onList || restoring || !countsKnown) return
    if (restore.step === 'held') {
      // Still where the app opened after a failed start: keep the old one.
      if (category === restore.category && isBareSearch(searchStr)) return
      setRestore(RESTORED)
    }
    if (readPref('lastCategory') !== category) {
      writePref('lastCategory', category)
    }
  }, [onList, restoring, countsKnown, category, restore, searchStr])

  // The `hash` the app wrote by itself, until a `hash` Alex chose.
  const appHashRef = useRef<string | null>(null)
  const noteHashWrite = useCallback((next: string | null, chosen: boolean) => {
    appHashRef.current = chosen ? null : next
  }, [])
  // Only one of this category's rows: in maindata, in the category, not
  // 已整理. Subscribed, so a torrent that arrives later is recorded then.
  const selectHashListed = useCallback(
    (data: Maindata) =>
      hash !== undefined &&
      Object.hasOwn(data.torrents, hash) &&
      listsIn(data.torrents[hash], category, data.stateBeforeMove),
    [hash, category],
  )
  const { data: hashListed = false } = useMaindata(selectHashListed)
  useEffect(() => {
    if (!onList || restoring || hash === undefined || !hashListed) return
    if (hash === appHashRef.current) return
    const current = readPref('lastViewedHash')
    const next = withViewedHash(current, category, hash)
    if (next !== current) writePref('lastViewedHash', next)
  }, [onList, restoring, hashListed, category, hash])

  const cancel = useCallback(() => setRestore(RESTORED), [])
  return { restoring, cancel, noteHashWrite }
}
