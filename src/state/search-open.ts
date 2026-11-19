import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

// Story 3.5, for the `_authed` layout: whether the header's search box is
// open, and the keyword the view filters by. One piece of state says Alex
// opened the box (the magnifier, `/`, typing); the box is open while that
// holds or a keyword is set, so a reload with `q` opens it and clearing the
// text keeps it open. ✕, 「取消」 and `Esc` drop both: nothing re-opens the
// box while the URL catches up.
// Closing on the settings page clears `q` there, but the list entry behind
// it in the history still holds the keyword (the page's back button and the
// browser's go back to it). Back on the list that keyword is not shown and
// is removed from the URL; typing again in between forgets it. A new filter
// puts the list back at the top (EXPERIENCE 換篩選回到最上面).

export interface SearchOpenInput {
  /** The URL's keyword (trimmed; `''` for none). */
  query: string
  /** The list route is on screen. */
  onList: boolean
  /** Writes the keyword into the list's URL (removed when empty). */
  writeQuery: (text: string) => void
  /** Removes the keyword from the page on screen. */
  removeQuery: () => void
  /** Puts the list back at the top. */
  resetScroll: () => void
}

export interface SearchOpen {
  /** The keyword the view filters by. */
  query: string
  open: boolean
  openSearch: () => void
  setQuery: (text: string) => void
  closeSearch: () => void
}

export function useSearchOpen({
  query,
  onList,
  writeQuery,
  removeQuery,
  resetScroll,
}: SearchOpenInput): SearchOpen {
  const [opened, setOpened] = useState(false)
  // The keyword closed on the settings page, still in the list's entry.
  const [closedOffList, setClosedOffList] = useState<string | null>(null)
  const stale = onList && closedOffList !== null && query === closedOffList
  const shown = stale ? '' : query

  useEffect(() => {
    if (!onList || closedOffList === null) return
    if (stale) removeQuery()
    else setClosedOffList(null)
  }, [onList, closedOffList, stale, removeQuery])

  const latestRef = useRef({ shown, onList })
  useLayoutEffect(() => {
    latestRef.current = { shown, onList }
  })

  const openSearch = useCallback(() => setOpened(true), [])
  const setQuery = useCallback(
    (text: string) => {
      setOpened(true)
      setClosedOffList(null)
      if (text.trim() !== latestRef.current.shown) resetScroll()
      // Always written: the view can lag behind a keystroke still on its
      // way to the URL, and the same search again changes nothing.
      writeQuery(text)
    },
    [writeQuery, resetScroll],
  )
  const closeSearch = useCallback(() => {
    setOpened(false)
    const latest = latestRef.current
    if (latest.shown === '') {
      removeQuery()
      return
    }
    resetScroll()
    if (!latest.onList) setClosedOffList(latest.shown)
    removeQuery()
  }, [removeQuery, resetScroll])

  return {
    query: shown,
    open: opened || shown !== '',
    openSearch,
    setQuery,
    closeSearch,
  }
}
