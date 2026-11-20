import { useEffect } from 'react'
import { createStore, useSelector } from '@tanstack/react-store'
import { selectTorrents, useMaindata } from '#/state/maindata'
import { useViewedHash } from '#/state/viewed-hash'

// Story 4.6 (PRD FR-38, EXPERIENCE add-torrent 「打開」): a torrent's detail
// opened from outside the list, the add screen's 「打開」 on a torrent
// qBittorrent already has (often archived, or in another category, so no
// list or board column holds it). The list and board detail targets show
// it with no position (no 「第 N 個／共 M 個」, no ‹ ›) while the URL's
// `hash` is this one and maindata has it. It ends when another row is
// chosen or the detail closes (the URL's `hash` changes after it got
// there), or when the torrent leaves the data. A torrent the list or the
// column does hold keeps its normal position: this is only the fallback.

interface OutsideState {
  hash: string | null
  /** The URL's `hash` has been this one since it was opened. */
  seen: boolean
}

const NONE: OutsideState = Object.freeze({ hash: null, seen: false })

// Browser only, like the other stores in src/state.
export const detailOutsideStore = createStore<OutsideState>(NONE)

/**
 * Marks `hash` as opened from outside the list. The caller then writes the
 * URL (`setHash`), which the upkeep below watches.
 */
export function openDetailOutside(hash: string): void {
  detailOutsideStore.setState(() => ({ hash, seen: false }))
}

export function clearDetailOutside(): void {
  if (detailOutsideStore.state.hash === null) return
  detailOutsideStore.setState(() => NONE)
}

/**
 * The hash opened from outside, while the URL's `hash` is it and maindata
 * has it; `null` otherwise.
 */
export function useOutsideHash(): string | null {
  const stored = useSelector(detailOutsideStore, (state) => state.hash)
  const { hash } = useViewedHash()
  const { data: torrents } = useMaindata(selectTorrents)
  if (stored === null || stored !== hash || !torrents) return null
  return Object.hasOwn(torrents, stored) ? stored : null
}

/**
 * Mounted once by the `_authed` layout with the URL's `hash`: ends the
 * state when the URL moves away after reaching it, or when maindata no
 * longer has the torrent.
 */
export function useDetailOutsideUpkeep(hash: string | null): void {
  const state = useSelector(detailOutsideStore, (each) => each)
  const { data: torrents } = useMaindata(selectTorrents)
  useEffect(() => {
    if (state.hash === null) return
    if (torrents !== undefined && !Object.hasOwn(torrents, state.hash)) {
      clearDetailOutside()
      return
    }
    if (hash === state.hash) {
      if (!state.seen) {
        detailOutsideStore.setState((current) =>
          current.hash === state.hash ? { ...current, seen: true } : current,
        )
      }
      return
    }
    if (state.seen) clearDetailOutside()
  }, [hash, state, torrents])
}

/** Tests: nothing opened from outside. */
export function resetDetailOutside(): void {
  detailOutsideStore.setState(() => NONE)
}
